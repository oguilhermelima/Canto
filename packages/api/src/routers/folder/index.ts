import { createTRPCRouter } from "../../trpc";
import { folderManageProcedures } from "./manage";
import { folderPathsProcedures } from "./paths";
import { folderRulesProcedures } from "./rules";

export const folderRouter = createTRPCRouter({
  ...folderManageProcedures,
  ...folderPathsProcedures,
  ...folderRulesProcedures,
});
