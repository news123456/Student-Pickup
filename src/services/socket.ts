import { io, Socket } from 'socket.io-client';

class SocketService {
  private static instance: SocketService | null = null;
  private socket: Socket | null = null;

  private constructor() {}

  static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  connect(): void {
    if (this.socket?.connected) return;
    this.socket = io({ autoConnect: true, reconnectionAttempts: 5, reconnectionDelay: 1000 });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  on<T>(event: string, callback: (data: T) => void): () => void {
    this.socket?.on(event, callback as (...args: unknown[]) => void);
    return () => this.socket?.off(event, callback as (...args: unknown[]) => void);
  }

  get connected(): boolean {
    return this.socket?.connected ?? false;
  }
}

export const socketService = SocketService.getInstance();
