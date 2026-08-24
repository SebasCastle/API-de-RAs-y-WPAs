/* eslint-disable prettier/prettier */
import { Body, Controller, Get, Post } from '@nestjs/common';
import { WpasService } from './wpa.service';
import type { WpaSyncPayload } from './interfaces/wpa-result.interface';

@Controller('wpa')
export class WpaController {
    constructor(private readonly wpaService: WpasService) {}

    @Get('Api/wpa')
    async iniciarWpa(){
    try {
        const resultado = await this.wpaService.iniciarProceso();
    return resultado;
    } 
    catch (error: void) {
    return {
        status: 'error',
        errorCode: 999,
        message: error.message,
        results: [],
      };
    }
  }
  @Post('sync')
  @HttpCode(200)
  recibirResultados( @Body() payload: WpaSyncPayload)
    {
    this.wpaService.recibirResultados(payload);
    return {
      ok: true,
      message: 'Resultados recibidos correctamente.',
    };
  }

  @Get('results')
  obtenerResultados() {
    return (
      this.wpaService.obtenerResultados() || {
        status: 'pending',
        message: 'Todavía no existen resultados.',
        results: [],
      }
    );
  }
}
function HttpCode(arg0: number): (target: WpaController, propertyKey: "recibirResultados", descriptor: TypedPropertyDescriptor<(payload: WpaSyncPayload) => { ok: boolean; message: string; }>) => void | TypedPropertyDescriptor<...> {
    throw new Error('Function not implemented.')
}

