"use client";

import { useEffect } from "react";
import { Sparkles } from "lucide-react";
import type { ConfigureFooter } from "../_components/onboarding-footer";

export function ReadyStep({
  onFinish,
  configureFooter,
}: {
  onFinish: () => void;
  configureFooter: ConfigureFooter;
}): React.JSX.Element {
  useEffect(() => {
    configureFooter({
      onPrimary: onFinish,
      primaryLabel: "Personalizar meu perfil",
      showBack: false,
      showDots: false,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10">
        <Sparkles className="h-10 w-10 text-primary" />
      </div>
      <div className="space-y-3">
        <h1 className="text-3xl font-bold text-foreground">Setup concluído</h1>
        <p className="mx-auto max-w-xl text-base text-muted-foreground leading-relaxed">
          Agora vamos dar um toque especial no seu perfil. Alguns detalhes pessoais
          e o Canto fica a sua cara.
        </p>
      </div>
    </div>
  );
}
