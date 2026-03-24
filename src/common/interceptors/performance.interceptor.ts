import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Performance');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context
      .switchToHttp()
      .getRequest<{ method: string; url: string }>();
    const { method, url } = req;
    const start = performance.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const ms = parseFloat((performance.now() - start).toFixed(2));
          this.logger.log(`[${method}] ${url} — ${ms}ms`);
        },
        error: () => {
          const ms = parseFloat((performance.now() - start).toFixed(2));
          this.logger.log(`[${method}] ${url} — ${ms}ms`);
        },
      }),
    );
  }
}
