import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Lookup, MultiLookup } from '../app/src/components/Lookup';
import { previewGateway } from '../app/src/services/preview';
import type { Gateway, LookupPage } from '../app/src/services/types/creator.types';

function renderManagerLookup(lookup: Gateway['lookup'], disabled = false, preload = false) {
  render(
    <Lookup
      name="Project_Manager"
      label="Project manager"
      source="managers"
      gateway={{ ...previewGateway, mode: 'live', lookup }}
      value={null}
      onChange={vi.fn()}
      errors={{}}
      disabled={disabled}
      preload={preload}
    />,
  );
  return screen.getByRole('combobox', { name: 'Project manager' });
}

async function advance(milliseconds = 200) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

const initialPage: LookupPage = { options: [{ id: '123', label: 'Alex' }] };

// jsdom has no layout engine, so give the actual scroll container measurable bounds.
function scrollableMenu() {
  const menu = screen.getByRole('listbox').parentElement!;
  Object.defineProperties(menu, {
    scrollHeight: { configurable: true, value: 1000 },
    clientHeight: { configurable: true, value: 300 },
  });
  return menu;
}

describe('Lookup browsing and searching', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('preloads managers before opening and reuses the results on reopening', async () => {
    const lookup = vi.fn<Gateway['lookup']>().mockResolvedValue(initialPage);
    const input = renderManagerLookup(lookup, false, true);
    await advance(0);
    expect(lookup).toHaveBeenCalledExactlyOnceWith('managers', '', undefined);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.focus(input);
    expect(screen.getByRole('option', { name: 'Alex' })).toBeVisible();
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.click(input);
    await advance();
    expect(screen.getByRole('option', { name: 'Alex' })).toBeVisible();
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('preloads C4 options through the multi-select component', async () => {
    const lookup = vi
      .fn<Gateway['lookup']>()
      .mockResolvedValue({ options: [{ id: '123', label: 'C4-TEST' }] });
    render(
      <MultiLookup
        name="C4"
        label="C4 references"
        source="c4"
        gateway={{ ...previewGateway, lookup }}
        values={[]}
        onChange={vi.fn()}
        errors={{}}
        preload
      />,
    );
    await advance(0);
    expect(lookup).toHaveBeenCalledExactlyOnceWith('c4', '', undefined);
    fireEvent.focus(screen.getByRole('combobox', { name: 'C4 references' }));
    expect(screen.getByRole('option', { name: 'C4-TEST' })).toBeVisible();
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('preloads sites only after client selection and discards the previous client’s pending results', async () => {
    let finish!: (page: LookupPage) => void;
    const lookup = vi
      .fn<Gateway['lookup']>()
      .mockImplementationOnce(
        () =>
          new Promise<LookupPage>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce({ options: [{ id: 'site-b', label: 'Site B' }] });
    const gateway = { ...previewGateway, lookup };
    const site = (clientId?: string) => (
      <Lookup
        name="Site"
        label="Site"
        source="sites"
        gateway={gateway}
        value={null}
        onChange={vi.fn()}
        errors={{}}
        clientId={clientId}
        disabled={!clientId}
        preload
      />
    );
    const view = render(site());
    await advance();
    expect(lookup).not.toHaveBeenCalled();
    view.rerender(site('client-a'));
    await advance(0);
    expect(lookup).toHaveBeenLastCalledWith('sites', '', 'client-a');
    view.rerender(site('client-b'));
    await advance(0);
    expect(lookup).toHaveBeenLastCalledWith('sites', '', 'client-b');
    await act(async () => {
      finish({ options: [{ id: 'site-a', label: 'Site A' }] });
    });
    fireEvent.focus(screen.getByRole('combobox', { name: 'Site' }));
    expect(screen.getByRole('option', { name: 'Site B' })).toBeVisible();
    expect(screen.queryByRole('option', { name: 'Site A' })).not.toBeInTheDocument();
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('loads and paginates initial records on opening without requiring text', async () => {
    const lookup = vi
      .fn<Gateway['lookup']>()
      .mockResolvedValueOnce({ ...initialPage, cursor: 'next-page' })
      .mockResolvedValueOnce({ options: [{ id: '456', label: 'Jamie' }] });
    const input = renderManagerLookup(lookup);
    await advance();
    expect(lookup).not.toHaveBeenCalled();

    fireEvent.focus(input);
    await advance(0);
    expect(lookup).toHaveBeenCalledExactlyOnceWith('managers', '', undefined);
    expect(screen.getByRole('option', { name: 'Alex' })).toBeVisible();
    fireEvent.change(input, { target: { value: '   ' } });
    await advance();
    expect(lookup).toHaveBeenCalledTimes(1);

    const menu = scrollableMenu();
    fireEvent.scroll(menu, { target: { scrollTop: 300 } });
    expect(lookup).toHaveBeenCalledTimes(1);
    fireEvent.scroll(menu, { target: { scrollTop: 680 } });
    await advance(0);
    expect(lookup).toHaveBeenLastCalledWith('managers', '', undefined, 'next-page');
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    fireEvent.scroll(menu, { target: { scrollTop: 700 } });
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('requests only one page during repeated scroll events and deduplicates appended records', async () => {
    let finish!: (page: LookupPage) => void;
    const lookup = vi
      .fn<Gateway['lookup']>()
      .mockResolvedValueOnce({ ...initialPage, cursor: 'next-page' })
      .mockImplementationOnce(
        () =>
          new Promise<LookupPage>((resolve) => {
            finish = resolve;
          }),
      );
    fireEvent.focus(renderManagerLookup(lookup));
    await advance(0);
    const menu = scrollableMenu();
    act(() => {
      fireEvent.scroll(menu, { target: { scrollTop: 700 } });
      fireEvent.scroll(menu);
      fireEvent.scroll(menu);
    });
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Loading…')).toBeVisible();
    await act(async () => {
      finish({ options: [...initialPage.options, { id: '456', label: 'Jamie' }] });
    });
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('keeps loaded records after a page failure and waits for explicit retry', async () => {
    const lookup = vi
      .fn<Gateway['lookup']>()
      .mockResolvedValueOnce({ ...initialPage, cursor: 'next-page' })
      .mockRejectedValueOnce(new Error('Page failed'))
      .mockResolvedValueOnce({ options: [{ id: '456', label: 'Jamie' }] });
    fireEvent.focus(renderManagerLookup(lookup));
    await advance(0);
    const menu = scrollableMenu();
    fireEvent.scroll(menu, { target: { scrollTop: 700 } });
    await advance(0);
    expect(screen.getByRole('alert')).toHaveTextContent('Page failed');
    expect(screen.getByRole('option', { name: 'Alex' })).toBeVisible();
    fireEvent.scroll(menu);
    await advance(0);
    expect(lookup).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Retry lookup' }));
    await advance(0);
    expect(lookup).toHaveBeenLastCalledWith('managers', '', undefined, 'next-page');
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores a pending page from an old search and paginates the new search', async () => {
    let finish!: (page: LookupPage) => void;
    const lookup = vi
      .fn<Gateway['lookup']>()
      .mockResolvedValueOnce({ ...initialPage, cursor: 'initial-next' })
      .mockImplementationOnce(
        () =>
          new Promise<LookupPage>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce({ options: [{ id: '456', label: 'Jamie' }], cursor: 'jamie-next' })
      .mockResolvedValueOnce({ options: [{ id: '789', label: 'Jamie Lee' }] });
    const input = renderManagerLookup(lookup);
    fireEvent.focus(input);
    await advance(0);
    const menu = scrollableMenu();
    fireEvent.scroll(menu, { target: { scrollTop: 700 } });
    fireEvent.change(input, { target: { value: 'Jamie' } });
    await advance();
    await act(async () => {
      finish(initialPage);
    });
    expect(screen.queryByRole('option', { name: 'Alex' })).not.toBeInTheDocument();
    fireEvent.scroll(menu);
    await advance(0);
    expect(lookup).toHaveBeenLastCalledWith('managers', 'Jamie', undefined, 'jamie-next');
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('debounces typed text and reloads the initial page when text is cleared', async () => {
    const lookup = vi
      .fn<Gateway['lookup']>()
      .mockResolvedValue(initialPage)
      .mockResolvedValueOnce({ options: [{ id: '456', label: 'Jamie' }] });
    const input = renderManagerLookup(lookup);
    fireEvent.focus(input);
    await advance(0);
    fireEvent.change(input, { target: { value: 'A' } });
    await advance(100);
    fireEvent.change(input, { target: { value: ' Alex ' } });
    await advance(199);
    expect(lookup).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(lookup).toHaveBeenLastCalledWith('managers', 'Alex', undefined);
    expect(screen.getByRole('option', { name: 'Alex' })).toBeVisible();
    expect(screen.queryByRole('option', { name: 'Jamie' })).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: '' } });
    await advance(0);
    expect(lookup).toHaveBeenCalledTimes(3);
    expect(lookup).toHaveBeenLastCalledWith('managers', '', undefined);
    expect(screen.getByRole('option', { name: 'Alex' })).toBeVisible();
  });

  it('cancels a scheduled search when clearing text before the typing delay ends', async () => {
    const lookup = vi.fn<Gateway['lookup']>().mockResolvedValue(initialPage);
    const input = renderManagerLookup(lookup);
    fireEvent.focus(input);
    await advance(0);
    fireEvent.change(input, { target: { value: 'Alex' } });
    await advance(100);
    fireEvent.change(input, { target: { value: '' } });
    await advance(1000);
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(lookup.mock.calls.every(([, query]) => query === '')).toBe(true);
    expect(screen.getByRole('option', { name: 'Alex' })).toBeVisible();
  });

  it('replaces a failed search with initial records when the search is cleared', async () => {
    const lookup = vi
      .fn<Gateway['lookup']>()
      .mockResolvedValueOnce(initialPage)
      .mockRejectedValueOnce(new Error('Search failed'))
      .mockResolvedValue(initialPage);
    const input = renderManagerLookup(lookup);
    fireEvent.focus(input);
    await advance(0);
    fireEvent.change(input, { target: { value: 'Alex' } });
    await advance();
    expect(screen.getByRole('alert')).toHaveTextContent('Search failed');

    fireEvent.change(input, { target: { value: '' } });
    await advance(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry lookup' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Alex' })).toBeVisible();
  });

  it.each(['success', 'failure'])(
    'ignores an older search %s after reloading initial records',
    async (outcome) => {
      let finish!: (page: LookupPage) => void;
      let fail!: (error: Error) => void;
      const lookup = vi
        .fn<Gateway['lookup']>()
        .mockResolvedValueOnce(initialPage)
        .mockImplementationOnce(
          () =>
            new Promise<LookupPage>((resolve, reject) => {
              finish = resolve;
              fail = reject;
            }),
        )
        .mockResolvedValue(initialPage);
      const input = renderManagerLookup(lookup);
      fireEvent.focus(input);
      await advance(0);
      fireEvent.change(input, { target: { value: 'Jamie' } });
      await advance();
      fireEvent.change(input, { target: { value: '' } });
      await advance(0);
      await act(async () => {
        if (outcome === 'success') finish({ options: [{ id: '456', label: 'Jamie' }] });
        else fail(new Error('Late API failure'));
      });

      expect(screen.getByRole('option', { name: 'Alex' })).toBeVisible();
      expect(screen.queryByRole('option', { name: 'Jamie' })).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
      expect(lookup).toHaveBeenCalledTimes(3);
    },
  );

  it('does not request records for a disabled lookup', async () => {
    const lookup = vi.fn<Gateway['lookup']>().mockResolvedValue(initialPage);
    const input = renderManagerLookup(lookup, true);
    expect(input).toBeDisabled();
    fireEvent.focus(input);
    await advance();
    expect(lookup).not.toHaveBeenCalled();
  });
});
