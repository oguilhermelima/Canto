"use client";

import Image from "next/image";

interface EpisodeCreditsPerson {
  name: string;
  job?: string;
  character?: string;
  department?: string;
  profilePath?: string | null;
}

interface EpisodeCreditsSectionProps {
  title: string;
  people: EpisodeCreditsPerson[];
  showCharacter?: boolean;
}

export function EpisodeCreditsSection({
  title,
  people,
  showCharacter,
}: EpisodeCreditsSectionProps): React.JSX.Element {
  return (
    <div className="mt-8">
      <h3 className="mb-4 text-lg font-bold">{title}</h3>
      <div className="flex flex-wrap gap-3">
        {people.map((person, i) => (
          <div
            key={`${person.name}-${i}`}
            className="flex items-center gap-3 rounded-lg bg-muted/30 px-3 py-2"
          >
            {person.profilePath ? (
              <Image
                src={`https://image.tmdb.org/t/p/w92${person.profilePath}`}
                alt={person.name}
                width={36}
                height={36}
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                {person.name.charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium leading-tight">{person.name}</p>
              <p className="text-xs text-muted-foreground">
                {showCharacter ? person.character : person.job}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
