import { runLab, type LabParams, type LabProgress, type Table } from './experiments';

export type LabRequest = { type: 'run'; params: LabParams };
export type LabResponse = ({ type: 'progress' } & LabProgress) | { type: 'done'; tables: Table[] } | { type: 'error'; message: string };

interface WorkerScope {
  postMessage(message: LabResponse): void;
  onmessage: ((event: MessageEvent<LabRequest>) => void) | null;
}

const ctx = self as unknown as WorkerScope;

ctx.onmessage = (event) => {
  try {
    const tables = runLab(event.data.params, { onProgress: (p) => ctx.postMessage({ type: 'progress', ...p }) });
    ctx.postMessage({ type: 'done', tables });
  } catch (err) {
    ctx.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
