import { defineModule } from "@/core/modules/define";
import * as schema from "./schema";

export const manifest = defineModule({
  id: "students",
  schema,
});
