import type { Gateway } from '../app/src/services/types/creator.types';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '../app/src/App';
import { previewGateway } from '../app/src/services/preview';
import { CreatorError } from '../app/src/services/creator';
async function reachReview(gateway: Gateway) {
  const user = userEvent.setup();
  render(<App initialGateway={gateway} />);
  await user.selectOptions(screen.getByRole('combobox', { name: 'Project type' }), 'C&I - Channel');
  await user.click(screen.getByLabelText('Grid-GFL'));
  await user.selectOptions(screen.getByRole('combobox', { name: 'Coupling type' }), 'AC Coupling');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.type(screen.getByRole('combobox', { name: 'Client' }), 'Riverbank');
  await user.click(await screen.findByRole('option', { name: 'Riverbank Energy (sample)' }));
  await user.type(screen.getByRole('combobox', { name: 'Country' }), 'New Zealand');
  await user.click(await screen.findByRole('option', { name: 'New Zealand' }));
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  return user;
}
describe('Submission UI', () => {
  it('locks during creation and displays success only once Zoho confirms', async () => {
    let finish!: (value: { id: string }) => void;
    const create = vi.fn(
      () =>
        new Promise<{ id: string }>((resolve) => {
          finish = resolve;
        }),
    );
    const user = await reachReview({ ...previewGateway, mode: 'live', create });
    await user.dblClick(screen.getByRole('button', { name: 'Create project' }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
    expect(screen.queryByText('PROJECT CREATED')).not.toBeInTheDocument();
    finish({ id: '12345' });
    expect(await screen.findByText('PROJECT CREATED')).toBeVisible();
  });
  it('keeps the draft and allows correction after a validation rejection', async () => {
    const create = vi.fn().mockRejectedValue(new CreatorError('Please input a PO'));
    const user = await reachReview({ ...previewGateway, mode: 'live', create });
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    expect(await screen.findByText('Please input a PO')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
    expect(screen.queryByText('PROJECT CREATED')).not.toBeInTheDocument();
  });
  it('blocks a repeat submission when the network outcome is unknown', async () => {
    const create = vi.fn().mockRejectedValue(new CreatorError('Check the report first.', true));
    const user = await reachReview({ ...previewGateway, mode: 'live', create });
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create project' })).toBeDisabled(),
    );
    expect(screen.getByText('Creation needs checking')).toBeVisible();
    expect(create).toHaveBeenCalledTimes(1);
  });
});
