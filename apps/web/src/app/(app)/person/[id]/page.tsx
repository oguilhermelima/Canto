"use client";

import { use, useEffect } from "react";
import { trpc } from "~/lib/trpc/client";
import { StateMessage } from "~/components/layout/state-message";
import { PersonHero } from "./_components/person-hero";
import { FilmographyTimeline } from "./_components/filmography-timeline";
import { PhotoGallery } from "./_components/photo-gallery";
import { PersonPageSkeleton } from "./_components/person-skeleton";

interface PersonPageProps {
  params: Promise<{ id: string }>;
}

export default function PersonPage({
  params,
}: PersonPageProps): React.JSX.Element {
  const { id } = use(params);
  const personId = parseInt(id, 10);

  const { data: person, isLoading, isError, refetch } = trpc.media.getPerson.useQuery(
    { personId },
    { enabled: !Number.isNaN(personId) },
  );

  useEffect(() => {
    if (person?.name) {
      document.title = `${person.name} — Canto`;
    }
  }, [person?.name]);

  if (isLoading) return <PersonPageSkeleton />;

  if (isError) {
    return (
      <div className="min-h-screen bg-background">
        <StateMessage preset="error" onRetry={() => void refetch()} minHeight="60vh" />
      </div>
    );
  }

  if (!person) {
    return (
      <div className="min-h-screen bg-background">
        <StateMessage preset="emptyPerson" minHeight="60vh" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PersonHero person={person} />

      {/* Biography */}
      {person.biography && (
        <div className="mx-auto w-full px-4 pt-6 md:px-8 lg:px-12 xl:px-16 2xl:px-24">
          <h2 className="mb-3 text-xl font-semibold text-foreground">
            Biography
          </h2>
          <p className="max-w-4xl whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {person.biography}
          </p>
        </div>
      )}

      <FilmographyTimeline
        movieCredits={person.movieCredits}
        tvCredits={person.tvCredits}
      />

      {person.images.length > 1 && (
        <div className="mt-16 pb-16 md:mt-20">
          <PhotoGallery images={person.images} name={person.name} />
        </div>
      )}
    </div>
  );
}
