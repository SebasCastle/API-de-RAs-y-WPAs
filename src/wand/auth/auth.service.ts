import { Injectable } from "@nestjs/common";
import { SessionService } from "./session.service";
import { LoginResponse } from "../interface/login.interface";
import { UserResponse } from "../interface/user.interface";

@Injectable()
export class AuthService {
  constructor(private readonly session: SessionService) {}

  async login() {
    if (
      this.session.isLogged() &&
      this.session.getAgentId() &&
      !this.session.isExpired()
    ) {
      return {
        success: true,
        message: "Ya existe una sesión activa.",
      };
    }

    const client = this.session.getClient();

    // checkout iniciar conexión con el cliente y obtener cookies de sesión
    this.session.clear();
    console.log("========== CHECKOUT ==========");
    console.log(this.session.getCookieHeader());
    const checkout = await client.get(
      "https://wand-avis.prod.avisbudget.com/wand/wandui/app/wand/checkout",
    );
    console.log(checkout.status);
    console.dir(checkout.data, { depth: null });

    // login

    const body = new URLSearchParams();
    //construyo e lformulario de inico de sesión
    // console.log('USER', process.env.WAND_USER);
    // console.log('PASSWORD', process.env.WAND_PASSWORD!);
    body.append("login-form-type", "pwd");
    body.append("username", process.env.WAND_USER!);
    body.append("PASSWORD", process.env.WAND_PASSWORD!);
    // enviar login
    console.log("========== LOGIN ==========");
    const login = await client.post<LoginResponse>(
      "https://wand-avis.prod.avisbudget.com/pkmslogin.form",

      body.toString(),

      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    console.log(login.status);
    console.dir(login.data, { depth: null });
    console.log(this.session.getCookieHeader());

    if (login.data.operation !== "login_success") {
      // const error = new Error('Error al iniciar sesión en WAND: ');
      // console.error(error);
      console.log("STATUS:", login.status);
      console.log("HEADERS:", login.headers);
      console.dir(login.data, { depth: null });
      return {
        success: false,
        message: "Credenciales incorrectas.",
      };
    }

    //---------------------------------------
    // userReq
    //---------------------------------------

    const userResponse = await client.post<UserResponse>("/wand/user/userReq", {
      loc: null,
      res: null,
      lname: null,
      mnemonic: null,
    });
    if (!userResponse.data.agentId) {
      this.session.clear();
      throw new Error("WAND no devolvió un agentId.");
    }
    this.session.setAgentId(userResponse.data.agentId);
    // console.log('=========== USERREQ ==========');
    // console.dir(userResponse.data, {
    //   depth: null,
    // });
    // console.log('STATUS');
    // console.log(userResponse.status);

    // console.log('HEADERS');
    // console.dir(userResponse.headers, {
    //   depth: null,
    // });

    // console.log('BODY');
    // console.dir(userResponse.data, {
    //   depth: null,
    // });
    //---------------------------------------
    // select location
    //---------------------------------------

    const location = await client.post(
      "https://wand-avis.prod.avisbudget.com/wand/user/selectLocation",
      {
        stationMnemonic: this.session.getStation(),
      },
      {
        headers: {
          Cookie: this.session.getCookieHeader(),
        },
      },
    );
    this.session.updateCookies(location.headers["set-cookie"]);
    if (location.status !== 200) {
      this.session.clear();
      throw new Error("No fue posible seleccionar la estación.");
    }
    this.session.markLoggedIn();

    return {
      success: true,
      message: "Login iniciado correctamente. Esperando peticiones.",
    };
  }

  async ensureLogin() {
    console.log(this.session.getSessionInfo());
    console.log(this.session.getCookieHeader());

    if (
      this.session.isLogged() &&
      this.session.getAgentId() &&
      !this.session.isExpired()
    ) {
      return;
    }
    this.session.clear();

    return this.login();
  }
}
