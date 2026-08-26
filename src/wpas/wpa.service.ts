import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { ChildProcess, spawn } from "child_process";
import { Model } from "mongoose";
import { WPA } from "./entities/wpa.entity";
import { WpaSyncPayload } from "./interfaces/wpa-result.interface";

@Injectable()
export class WpasService {
  private resultados: WpaSyncPayload | null = null;
  private proceso: ChildProcess | null = null;

  constructor(
    @InjectModel(WPA.name)
    private readonly wandRaModel: Model<WPA>,
  ) {}

  async iniciarProceso(): Promise<WpaSyncPayload> {
    if (this.proceso) {
      throw new Error("El proceso BlueZone ya está ejecutándose.");
    }

    this.resultados = null;
    this.ejecutarBat();

    return this.esperarResultado();
  }

  recibirResultados(payload: WpaSyncPayload): void {
    this.resultados = payload;
    console.log(`BlueZone terminó. Status: ${payload.status}`);
  }

  obtenerResultados(): WpaSyncPayload | null {
    return this.resultados;
  }

  private ejecutarBat(): void {
    const batPath =
      "C:\\Users\\sebas\\OneDrive\\Documentos\\BlueZone\\Scripts\\start-bluezone.bat";

    this.proceso = spawn("cmd.exe", ["/c", batPath], {
      windowsHide: false,
    });

    this.proceso.on("error", (error) => {
      console.error("Error iniciando BlueZone:", error);
      this.proceso = null;
    });

    this.proceso.on("close", () => {
      this.proceso = null;
    });
  }

  private esperarResultado(): Promise<WpaSyncPayload> {
    return new Promise((resolve, reject) => {
      const inicio = Date.now();
      const intervalo = setInterval(() => {
        if (this.resultados) {
          clearInterval(intervalo);
          resolve(this.resultados);
          return;
        }

        const tiempoTranscurrido = Date.now() - inicio;

        if (tiempoTranscurrido > 300000) {
          clearInterval(intervalo);
          reject(
            new Error("BlueZone no respondió dentro del tiempo esperado."),
          );
        }
      }, 1000);
    });
  }
}
