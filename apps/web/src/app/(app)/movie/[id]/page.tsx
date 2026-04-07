import MediaPage from "../../media/[id]/page";

export default function MoviePage(props: { params: Promise<{ id: string }> }): React.JSX.Element {
  return <MediaPage params={props.params} mediaType="movie" />;
}
