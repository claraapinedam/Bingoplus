import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Envelope<T> {
  data: T;
}

/** Wraps every successful controller response in the { data } envelope described in docs/06-api-architecture.md. */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Envelope<T>> {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<Envelope<T>> {
    return next.handle().pipe(map((payload) => (payload?.meta ? payload : { data: payload })));
  }
}
