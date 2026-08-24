import { underline } from "colors";
import { CorsOptions } from "cors";

export const corsConfig: CorsOptions = {
    origin(requestOrigin, callback) {
        const whiteList = [process.env.FRONTEND_URL]

        if(process.argv[2] === '--api'){
            whiteList.push(undefined)
        }

        whiteList.includes(requestOrigin)?callback(null, true):callback(new Error('Error CORS'))
    },

}
