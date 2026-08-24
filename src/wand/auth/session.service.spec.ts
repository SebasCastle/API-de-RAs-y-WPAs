import { AxiosHeaders } from 'axios';
import { SessionService } from './session.service';

describe('SessionService', () => {
  it('reuses the same Axios instance', () => {
    const session = new SessionService();

    expect(session.getClient()).toBe(session.getClient());
  });

  it('stores only name=value and replaces cookies by name', () => {
    const session = new SessionService();

    session.updateCookies([
      'PD-S-SESSION-ID=first; Path=/; Secure; HttpOnly; SameSite=None',
      'JSESSIONID=abc==; Path=/wand',
    ]);
    session.updateCookies('PD-S-SESSION-ID=second; Path=/; HttpOnly');

    expect(session.getCookies()).toEqual([
      'PD-S-SESSION-ID=second',
      'JSESSIONID=abc==',
    ]);
    expect(session.getCookieHeader()).not.toMatch(
      /Path|Secure|HttpOnly|SameSite/,
    );
  });

  it('removes cookies invalidated by the server', () => {
    const session = new SessionService();

    session.updateCookies('token=value; Path=/');
    session.updateCookies('token=; Max-Age=0; Path=/');

    expect(session.getCookies()).toEqual([]);
  });

  it('updates response cookies before the next request', async () => {
    const session = new SessionService();
    const client = session.getClient();
    let sentCookie: string | undefined;

    await client.get('/first', {
      adapter: (config) =>
        Promise.resolve({
          config,
          data: {},
          headers: new AxiosHeaders({
            'set-cookie': ['session=one; Path=/; Secure'],
          }),
          status: 200,
          statusText: 'OK',
        }),
    });

    await client.get('/second', {
      adapter: (config) => {
        const cookieHeader = config.headers.get('Cookie');
        sentCookie =
          typeof cookieHeader === 'string' ? cookieHeader : undefined;

        return Promise.resolve({
          config,
          data: {},
          headers: new AxiosHeaders(),
          status: 200,
          statusText: 'OK',
        });
      },
    });

    expect(sentCookie).toBe('session=one');
  });
});
