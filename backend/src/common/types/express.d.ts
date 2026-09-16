import 'express';

declare module 'express' {
  interface Request {
    tenantId?: string;
    userId?: string;
    body?: any;
    headers?: any;
    socket?: any;
    ip?: string;
  }
  interface Response {}
}
