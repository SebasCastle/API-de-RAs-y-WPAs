import { MongooseModule } from "@nestjs/mongoose";
// import { ServeStaticModule } from "@nestjs/serve-static";
// import { join } from "path";
import { Module } from "@nestjs/common";

import { WandModule } from "./wand/wand.module";
import { FleetmasModule } from "./fleetmas/fleetmas.module";
import { SyncModule } from "./sync/sync.module";
import { ComparisonModule } from "./comparison/comparison.module";
import { ConfigModule } from "@nestjs/config";
import { WpasModule } from "./wpas/wpas.module";

@Module({
  imports: [
    // ServeStaticModule.forRoot({
    //   rootPath: join(__dirname, "..", "public"),
    // }),
    ConfigModule.forRoot({
      isGlobal: true, // Esto hace que no necesites importar el módulo en otros archivos
    }),
    MongooseModule.forRoot("mongodb://localhost:27017/sync-wand"),

    WandModule,
    FleetmasModule,
    SyncModule,
    ComparisonModule,
    WpasModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
