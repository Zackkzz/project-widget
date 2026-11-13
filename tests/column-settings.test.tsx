import * as React from 'react';
import { createPortal } from 'react-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createColumnSettings, reorderColumns } from '../app/src/components/columns/ColumnSettings';

const columns = [
  { name: 'Project_Name', label: 'Project Name' },
  { name: 'Client', label: 'Client' },
  { name: 'Country', label: 'Country' },
  { name: 'Status', label: 'Status' },
];
const Settings = createColumnSettings(React, createPortal, () => <svg />, {
  normalizeSelection: (names) => [...new Set(['Project_Name', ...names])],
  normalizeOrder: (names) => [
    ...new Set(['Project_Name', ...names, ...columns.map((c) => c.name)]),
  ],
  defaults: ['Project_Name', 'Country'],
});
function open() {
  const apply = vi.fn();
  render(
    <Settings
      columns={columns}
      selected={['Project_Name', 'Client', 'Country']}
      order={['Project_Name', 'Client', 'Country', 'Status']}
      onApply={apply}
      onRetry={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Choose fields' }));
  return apply;
}
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
describe('Combined column settings', () => {
  it('keeps the drag preview when native dragleave bubbles from a child icon', () => {
    open();
    const handle = screen.getByRole('button', { name: 'Drag Client' });
    fireEvent.dragStart(handle, { dataTransfer: { setData: vi.fn() } });
    const list = screen.getByRole('region', { name: 'Column visibility and display order' });
    const over = new Event('dragover', { bubbles: true });
    Object.defineProperties(over, { clientY: { value: 120 }, dataTransfer: { value: {} } });
    fireEvent(list, over);
    const row = handle.closest('.column-setting-row')!;
    expect(row).toHaveAttribute('data-position', '3');
    fireEvent.dragLeave(handle, { relatedTarget: null });
    expect(row).toHaveAttribute('data-position', '3');
  });
  it('previews upward and downward insertions without mutating the saved order or moving Project Name', () => {
    const order = ['Project_Name', 'Client', 'Country', 'Status'];
    expect(reorderColumns(order, 'Client', 'Status')).toEqual([
      'Project_Name',
      'Country',
      'Status',
      'Client',
    ]);
    expect(reorderColumns(order, 'Status', 'Client')).toEqual([
      'Project_Name',
      'Status',
      'Client',
      'Country',
    ]);
    expect(reorderColumns(order, 'Status', 'Project_Name')).toBe(order);
    expect(order).toEqual(['Project_Name', 'Client', 'Country', 'Status']);
  });
  it('stages selection and ordering until Apply, and Cancel preserves saved preferences', () => {
    const apply = open();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show Client' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Country up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Choose fields' }));
    expect(screen.getByRole('checkbox', { name: 'Show Client' })).toBeChecked();
  });
  it('supports keyboard movement and a fixed first field', () => {
    const apply = open();
    expect(screen.getByRole('checkbox', { name: 'Show Project Name' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Client up' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Drag Country' }), { key: 'ArrowUp' });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(apply.mock.calls[0][1].slice(0, 3)).toEqual(['Project_Name', 'Country', 'Client']);
  });
  it('can find hidden fields and add them to the end of the visible sequence', () => {
    const apply = open();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Status' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show Status' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(apply.mock.calls[0][0]).toContain('Status');
    expect(apply.mock.calls[0][1].at(-1)).toBe('Status');
  });
  it('resets visibility without discarding a custom order', () => {
    const apply = open();
    fireEvent.click(screen.getByRole('button', { name: 'Move Country up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(apply).toHaveBeenCalledWith(
      ['Project_Name', 'Country'],
      ['Project_Name', 'Country', 'Client', 'Status'],
    );
  });
});
