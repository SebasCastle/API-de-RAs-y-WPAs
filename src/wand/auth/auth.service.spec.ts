import { ConfigService } from '@nestjs/config';
import { AxiosInstance } from 'axios';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

describe('AuthService', () => {
  it('shares one in-flight login between concurrent callers', async () => {
    let resolveCheckout: (() => void) | undefined;
    const checkout = new Promise<void>((resolve) => {
      resolveCheckout = resolve;
    });
    const get = jest.fn(async () => checkout);
    const post = jest
      .fn()
      .mockResolvedValueOnce({
        data: { operation: 'login_success' },
        headers: {},
        status: 200,
      })
      .mockResolvedValueOnce({ data: { agentId: '98290' } })
      .mockResolvedValueOnce({ data: {} });
    const markLoggedIn = jest.fn();
    const client = {
      get,
      post,
    } as unknown as AxiosInstance;
    const session = {
      isLogged: jest.fn(() => false),
      isSessionExpired: jest.fn(() => true),
      clear: jest.fn(),
      getClient: jest.fn(() => client),
      getStation: jest.fn(() => 'QU4'),
      setAgentId: jest.fn(),
      markLoggedIn,
    } as unknown as SessionService;
    const config = {
      get: jest.fn((key: string) =>
        key === 'WAND_USER' ? 'user' : 'password',
      ),
    } as unknown as ConfigService;
    const auth = new AuthService(session, config);

    const first = auth.login();
    const second = auth.login();
    resolveCheckout?.();

    const results = await Promise.all([first, second]);

    expect(results.every((result) => result.success)).toBe(true);
    expect(get).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(3);
    expect(markLoggedIn).toHaveBeenCalledTimes(1);
  });

  it('follows a successful WebSEAL redirect without posting credentials again', async () => {
    const get = jest
      .fn()
      .mockResolvedValueOnce({ data: { operation: 'login' }, headers: {} })
      .mockResolvedValueOnce({
        data: {},
        headers: {
          location:
            'https://wand-avis.prod.avisbudget.com/wand/wandui/index.html',
        },
        status: 302,
      })
      .mockResolvedValueOnce({
        data: '<html></html>',
        headers: {},
        status: 200,
      });
    const post = jest
      .fn()
      .mockResolvedValueOnce({
        data: {
          error_code: '0x38cf0421',
          error_message: 'Moved Temporarily',
        },
        headers: {
          location:
            'https://wand-avis.prod.avisbudget.com/wand/wandui/app/wand/checkout',
        },
        status: 302,
      })
      .mockResolvedValueOnce({ data: { agentId: '98290' } })
      .mockResolvedValueOnce({ data: {} });
    const markLoggedIn = jest.fn();
    const client = {
      get,
      post,
    } as unknown as AxiosInstance;
    const session = {
      isLogged: jest.fn(() => false),
      isSessionExpired: jest.fn(() => true),
      clear: jest.fn(),
      getClient: jest.fn(() => client),
      getStation: jest.fn(() => 'QU4'),
      setAgentId: jest.fn(),
      markLoggedIn,
    } as unknown as SessionService;
    const config = {
      get: jest.fn((key: string) =>
        key === 'WAND_USER' ? 'user' : 'password',
      ),
    } as unknown as ConfigService;
    const auth = new AuthService(session, config);

    const result = await auth.login();

    expect(result.success).toBe(true);
    expect(get).toHaveBeenCalledTimes(3);
    expect(post).toHaveBeenCalledTimes(3);
    expect(markLoggedIn).toHaveBeenCalledTimes(1);
  });
});
