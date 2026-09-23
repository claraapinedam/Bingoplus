import { ArgumentsHost, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

function mockHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status };
  const request = { method: 'POST', url: '/auth/login' };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('HttpExceptionFilter', () => {
  it('normalizes a plain-string built-in exception (e.g. UnauthorizedException) into {error: {code, message}} instead of passing Nest\'s raw {statusCode, message, error} shape through', () => {
    const filter = new HttpExceptionFilter();
    const { host, status, json } = mockHost();

    filter.catch(new UnauthorizedException('Correo o contraseña incorrectos.'), host);

    expect(status).toHaveBeenCalledWith(401);
    const body = json.mock.calls[0][0];
    expect(typeof body.error).toBe('object');
    expect(body.error.message).toBe('Correo o contraseña incorrectos.');
  });

  it('leaves an already-structured {error: {code, message}} exception body untouched', () => {
    const filter = new HttpExceptionFilter();
    const { host, json } = mockHost();

    filter.catch(new BadRequestException({ error: { code: 'ORDER_ALREADY_UPDATED', message: 'Someone else got there first.' } }), host);

    const body = json.mock.calls[0][0];
    expect(body.error.code).toBe('ORDER_ALREADY_UPDATED');
    expect(body.error.message).toBe('Someone else got there first.');
  });

  it('still normalizes class-validator\'s array-of-strings message into a joined string', () => {
    const filter = new HttpExceptionFilter();
    const { host, json } = mockHost();

    filter.catch(new BadRequestException(['email must be an email', 'password should not be empty']), host);

    const body = json.mock.calls[0][0];
    expect(body.error.message).toBe('email must be an email, password should not be empty');
    expect(body.error.details).toEqual(['email must be an email', 'password should not be empty']);
  });
});
