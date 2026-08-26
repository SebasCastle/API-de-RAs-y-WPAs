import { AxiosInstance } from "axios";
import { AuthService } from "./auth.service";
import { SessionService } from "./session.service";
import { WandCredentialStore } from "./wand-credential-store.service";
import {
  PasswordRotationResult,
  WandPasswordRotationService,
} from "./wand-password-rotation.service";

describe("WandPasswordRotationService", () => {
  const changePasswordHtml = `
    <form action="/tim/selfserv/ChangePasswordServlet" method="post">
      <input name="logonID" />
      <input name="currentPassword" />
      <input name="newPassword" />
      <input name="confirmNewPassword" />
    </form>
  `;

  it("calculates the next password by changing only the last letter", () => {
    const service = createService().service;

    expect(service.nextPassword("AvisPassa")).toBe("AvisPassb");
    expect(service.nextPassword("AvisPassz")).toBe("AvisPassa");
    expect(service.nextPassword("AvisPassZ")).toBe("AvisPassA");
  });

  it("detects rotation due after three calendar months or when no date exists", () => {
    const service = createService().service;
    const now = new Date("2026-08-24T00:00:00.000Z");

    expect(service.isRotationDue(null, now)).toBe(true);
    expect(
      service.isRotationDue(new Date("2026-05-24T00:00:00.000Z"), now),
    ).toBe(true);
    expect(
      service.isRotationDue(new Date("2026-08-01T00:00:00.000Z"), now),
    ).toBe(false);
  });

  it("shares one in-flight password rotation between concurrent callers", async () => {
    const { service } = createService();
    let resolveRotation: ((value: unknown) => void) | undefined;
    const rotation: Promise<PasswordRotationResult> = new Promise((resolve) => {
      resolveRotation = resolve;
    });
    const performRotation = jest
      .spyOn(
        service as unknown as {
          performRotation: () => Promise<PasswordRotationResult>;
        },
        "performRotation",
      )
      .mockReturnValue(rotation);

    const first = service.rotateIfDue({ force: true });
    const second = service.rotateIfDue({ force: true });

    resolveRotation?.({
      rotated: true,
      skipped: false,
      reason: "ok",
      checkedAt: "2026-08-24T00:00:00.000Z",
      lastPasswordChangedAt: "2026-08-24T00:00:00.000Z",
      nextPasswordChangedAt: "2026-11-22T00:00:00.000Z",
    });

    await Promise.all([first, second]);

    expect(performRotation).toHaveBeenCalledTimes(1);
  });

  it("saves the new password only after WAND accepts it and real login succeeds", async () => {
    const get = jest
      .fn()
      .mockResolvedValueOnce({ status: 200, data: {} })
      .mockResolvedValueOnce({ status: 200, data: changePasswordHtml });
    const post = jest
      .fn()
      .mockResolvedValueOnce({ status: 200, data: {} })
      .mockResolvedValueOnce({ status: 200, data: "Password changed" });
    const { service, authService, savePasswordRotation } = createService({
      client: { get, post } as unknown as AxiosInstance,
    });

    jest.spyOn(authService, "login").mockResolvedValue({
      success: true,
      message: "ok",
      logged: true,
    });

    const result = await service.rotateIfDue({ force: true });

    expect(result.rotated).toBe(true);
    expect(savePasswordRotation).toHaveBeenCalledWith(
      "Currentb",
      expect.any(Date),
    );
  });

  it("keeps previous credentials when verification login fails", async () => {
    const get = jest
      .fn()
      .mockResolvedValueOnce({ status: 200, data: {} })
      .mockResolvedValueOnce({ status: 200, data: changePasswordHtml });
    const post = jest
      .fn()
      .mockResolvedValueOnce({ status: 200, data: {} })
      .mockResolvedValueOnce({ status: 200, data: "Password changed" });
    const { service, authService, savePasswordRotation } = createService({
      client: { get, post } as unknown as AxiosInstance,
    });

    jest.spyOn(authService, "login").mockResolvedValue({
      success: false,
      message: "bad",
      logged: false,
    });

    await expect(service.rotateIfDue({ force: true })).rejects.toThrow(
      "No se guardaron credenciales",
    );
    expect(savePasswordRotation).not.toHaveBeenCalled();
  });

  function createService(options: { client?: AxiosInstance } = {}) {
    const client =
      options.client ??
      ({
        get: jest.fn(),
        post: jest.fn(),
      } as unknown as AxiosInstance);
    const session = {
      clear: jest.fn(),
      getClient: jest.fn(() => client),
    } as unknown as SessionService;
    const authService = {
      login: jest.fn(),
    } as unknown as AuthService;
    const savePasswordRotation = jest.fn();
    const credentialStore = {
      getCredentials: jest.fn(() => ({
        username: "user",
        password: "Currenta",
        lastPasswordChangedAt: new Date("2026-01-01T00:00:00.000Z"),
      })),
      savePasswordRotation,
    } as unknown as WandCredentialStore;
    const service = new WandPasswordRotationService(
      session,
      authService,
      credentialStore,
    );

    return {
      service,
      authService,
      credentialStore,
      savePasswordRotation,
    };
  }
});
