import {
  getSyncDispatcher,
  SyncDispatcher,
  WorkerQueuePayload,
} from '@/server/sync/dispatcher';

export class WorkerRuntime {
  private readonly dispatcher: SyncDispatcher;
  private running = false;

  constructor(dispatcher: SyncDispatcher = getSyncDispatcher()) {
    this.dispatcher = dispatcher;
  }

  start(): void {
    this.running = true;
  }

  stop(): void {
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  async handleJob(payload: WorkerQueuePayload): Promise<unknown> {
    return this.dispatcher.processWorkerJob(payload);
  }
}

export function startStandaloneWorker(): WorkerRuntime {
  const runtime = new WorkerRuntime();
  runtime.start();
  return runtime;
}

if (process.env.RUN_STANDALONE_WORKER === 'true') {
  startStandaloneWorker();
}
