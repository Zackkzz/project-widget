import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  delete window.ZOHO;
});
afterEach(() => {
  vi.useRealTimers();
  delete window.ZOHO;
  document.querySelectorAll('script').forEach((script) => script.remove());
});

it('shares the early SDK download with connection and permits a retry after timeout', async () => {
  const { loadCreatorSDK, connectCreator } = await import('../app/src/services/creator');
  const early = loadCreatorSDK();
  const connection = connectCreator();
  expect(document.querySelectorAll('script')).toHaveLength(1);
  const failedEarly = expect(early).rejects.toThrow('SDK download timed out');
  const failedConnection = expect(connection).rejects.toThrow('SDK download timed out');
  await vi.advanceTimersByTimeAsync(20000);
  await Promise.all([failedEarly, failedConnection]);
  expect(document.querySelectorAll('script')).toHaveLength(0);

  const retry = connectCreator();
  window.ZOHO = {
    CREATOR: {
      UTIL: {
        getInitParams: vi.fn().mockResolvedValue({ appLinkName: 'sungrowauservice' }),
        navigateParentURL: vi.fn(),
      },
      DATA: { getRecords: vi.fn(), addRecords: vi.fn() },
    },
  };
  document.querySelector('script')!.dispatchEvent(new Event('load'));
  expect((await retry).mode).toBe('live');
  expect(window.ZOHO.CREATOR.DATA.addRecords).not.toHaveBeenCalled();
});

it('distinguishes a missing host handshake from a failed SDK download', async () => {
  const { connectCreator } = await import('../app/src/services/creator');
  const sdk = {
    UTIL: {
      getInitParams: vi.fn(() => new Promise(() => {})),
      navigateParentURL: vi.fn(),
    },
    DATA: { getRecords: vi.fn(), addRecords: vi.fn() },
  };
  const failure = expect(connectCreator(sdk)).rejects.toThrow(
    'The Zoho SDK loaded, but Creator did not complete the widget connection.',
  );
  await vi.advanceTimersByTimeAsync(20000);
  await failure;
  expect(sdk.DATA.getRecords).not.toHaveBeenCalled();
  expect(sdk.DATA.addRecords).not.toHaveBeenCalled();
});

it('cleans up a blocked SDK script so retry can load a fresh copy', async () => {
  const { loadCreatorSDK } = await import('../app/src/services/creator');
  const failed = expect(loadCreatorSDK()).rejects.toThrow('Unable to load the Zoho widget SDK');
  document.querySelector('script')!.dispatchEvent(new Event('error'));
  await failed;
  expect(document.querySelectorAll('script')).toHaveLength(0);
  const retryFailed = expect(loadCreatorSDK()).rejects.toThrow('SDK download timed out');
  expect(document.querySelectorAll('script')).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(20000);
  await retryFailed;
});
