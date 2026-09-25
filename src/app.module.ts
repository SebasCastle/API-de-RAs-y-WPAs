import { TypeOrmModule } from "@nestjs/typeorm";
// import { ServeStaticModule } from "@nestjs/serve-static";
// import { join } from "path";
import { Module } from "@nestjs/common";

import { WandModule } from "./wand/wand.module";
import { FleetmasModule } from "./fleetmas/fleetmas.module";
import { ComparisonModule } from "./comparison/comparison.module";
import { ConfigModule } from "@nestjs/config";
import { WpasModule } from "./wpas/wpas.module";
import { ConfigService } from "@nestjs/config";

@Module({
  imports: [
    // ServeStaticModule.forRoot({
    //   rootPath: join(__dirname, "..", "public"),
    // }),
    ConfigModule.forRoot({
      isGlobal: true, // Esto hace que no necesites importar el módulo en otros archivos
    }),
    // Legacy MongoDB (se conserva la dependencia mientras se valida MySQL):
    // MongooseModule.forRoot("mongodb://localhost:27017/sync-wand"),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "mysql" as const,
        host: config.getOrThrow<string>("DB_HOST"),
        port: Number(config.get("DB_PORT", "3306")),
        username: config.getOrThrow<string>("DB_USERNAME"),
        password: config.getOrThrow<string>("DB_PASSWORD"),
        database: config.getOrThrow<string>("DB_DATABASE"),
        charset: "utf8mb4",
        autoLoadEntities: true,
        // Solo true en desarrollo. En produccion usa migraciones antes de desplegar.
        synchronize: config.get("DB_SYNCHRONIZE", "false") === "true",
        logging: config.get("DB_LOGGING", "false") === "true",
      }),
    }),

    WandModule,
    FleetmasModule,
    ComparisonModule,
    WpasModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
