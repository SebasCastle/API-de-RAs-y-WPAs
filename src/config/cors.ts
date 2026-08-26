import { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";

export const corsConfig: CorsOptions = {
  origin(requestOrigin, callback) {
    const whiteList = [process.env.FRONTEND_URL];

    if (process.argv[2] === "--api") {
      whiteList.push(undefined);
    }

    if (whiteList.includes(requestOrigin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Error CORS"));
  },
};
