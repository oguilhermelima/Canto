import { ListLoading } from "~/components/layout/list-loading";

export default function RequestsLoading(): React.JSX.Element {
  return <ListLoading count={4} showTabs showHeader />;
}
