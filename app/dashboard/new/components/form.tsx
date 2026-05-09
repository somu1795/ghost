"use client";
import { humanId } from "human-id";
import { ChevronDown } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getDefaults, hasRequiredFields, missingRequiredFields } from "@/games";
import type { SettingsSchema } from "@/games";
import { cn } from "@/lib/utils";

import { SettingsFields } from "../../[id]/components/game-settings-form";
import type {
  FieldValue,
  SettingsValuesRecord,
} from "../../[id]/components/game-settings-form";
import { PageBody, PageHeader } from "../../components/page-header";
import { createServer } from "../actions/create-server";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GameOption {
  id: string;
  name: string;
  description: string;
  image: string;
  requirements: { cpu: number; disk: number; memory: number };
  settings: SettingsSchema;
}

interface Props {
  games: GameOption[];
}

// ─── Steps ───────────────────────────────────────────────────────────────────

const STEPS = [
  { id: "game", title: "Game" },
  { id: "name", title: "Name" },
] as const;

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StepIndicatorProps {
  step: number;
}

const StepIndicator = ({ step }: StepIndicatorProps) => (
  <ol className="flex items-center gap-2">
    {STEPS.map((s, i) => {
      const done = i < step;
      const active = i === step;
      return (
        <li key={s.id} className="flex flex-1 items-center gap-2">
          <div
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums",
              active && "border-primary bg-primary text-primary-foreground",
              done && "border-primary bg-primary/10 text-primary",
              !(active || done) && "border-border text-muted-foreground"
            )}
          >
            {i + 1}
          </div>
          <span
            className={cn(
              "text-sm",
              active ? "font-medium" : "text-muted-foreground"
            )}
          >
            {s.title}
          </span>
          {i < STEPS.length - 1 && (
            <span
              className={cn(
                "ml-2 h-px flex-1",
                done ? "bg-primary" : "bg-border"
              )}
            />
          )}
        </li>
      );
    })}
  </ol>
);

interface GameStepProps {
  games: GameOption[];
  gameId: string;
  setGameId: (value: string) => void;
}

const GameStep = ({ games, gameId, setGameId }: GameStepProps) => (
  <section className="space-y-2">
    <Label>Choose a game</Label>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {games.map((game) => (
        <label
          key={game.id}
          className={cn(
            "relative cursor-pointer overflow-hidden rounded-lg border-2 transition",
            gameId === game.id
              ? "border-primary"
              : "border-border hover:border-muted-foreground"
          )}
        >
          <input
            type="radio"
            name="game"
            value={game.id}
            checked={gameId === game.id}
            onChange={(e) => setGameId(e.target.value)}
            className="sr-only"
          />
          <Image
            src={game.image}
            alt={game.name}
            width={460}
            height={215}
            className="aspect-[460/215] w-full object-cover"
          />
          <div className="p-2">
            <div className="font-medium text-sm">{game.name}</div>
            <div className="text-muted-foreground text-xs">
              {game.requirements.memory} GB · {game.requirements.cpu} vCPU ·{" "}
              {game.requirements.disk} GB disk
            </div>
          </div>
        </label>
      ))}
    </div>
  </section>
);

interface NameStepProps {
  name: string;
  setName: (value: string) => void;
  selectedGame: GameOption | undefined;
  settings: SettingsValuesRecord;
  setSettingField: (key: string, value: FieldValue) => void;
}

const SummaryRow = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex justify-between gap-4">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="font-medium">{children}</dd>
  </div>
);

const NameStep = ({
  name,
  setName,
  selectedGame,
  settings,
  setSettingField,
}: NameStepProps) => (
  <section className="space-y-4">
    <div className="space-y-2">
      <Label htmlFor="name">Server name</Label>
      <Input
        id="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        minLength={3}
        maxLength={40}
        placeholder="My server"
        autoFocus
      />
    </div>
    {selectedGame && (
      <Collapsible
        key={selectedGame.id}
        defaultOpen={hasRequiredFields(selectedGame.settings)}
      >
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="group w-full"
          >
            <span className="group-data-[state=open]:hidden">
              Customize game settings
            </span>
            <span className="hidden group-data-[state=open]:inline">
              Hide settings
            </span>
            <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 flex flex-col gap-1 rounded-md border border-border bg-background p-1">
          <SettingsFields
            schema={selectedGame.settings}
            values={settings}
            onChange={setSettingField}
          />
        </CollapsibleContent>
      </Collapsible>
    )}
    <dl className="grid gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
      <SummaryRow label="Game">{selectedGame?.name}</SummaryRow>
      <SummaryRow label="Hosted on">This server (Docker)</SummaryRow>
      <SummaryRow label="Cost">Free</SummaryRow>
    </dl>
  </section>
);

// ─── Main form ────────────────────────────────────────────────────────────────

const submitLabel = (isLast: boolean, pending: boolean) => {
  if (!isLast) return "Next";
  return pending ? "Queuing…" : "Create server";
};

export const NewServerForm = ({ games }: Props) => {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(() =>
    humanId({ capitalize: false, separator: "-" })
  );
  const [gameId, setGameId] = useState(games[0]?.id ?? "");

  const selectedGame = games.find((g) => g.id === gameId);

  const [settings, setSettings] = useState<SettingsValuesRecord>(() =>
    selectedGame ? (getDefaults(selectedGame.settings) as SettingsValuesRecord) : {}
  );

  useEffect(() => {
    if (selectedGame) {
      setSettings(getDefaults(selectedGame.settings) as SettingsValuesRecord);
    }
  }, [selectedGame]);

  const setSettingField = (key: string, value: FieldValue) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  const trimmedName = name.trim();
  const nameValid = trimmedName.length >= 3 && trimmedName.length <= 40;

  const stepValid = [Boolean(gameId), nameValid];

  const settingsValid = selectedGame
    ? missingRequiredFields(selectedGame.settings, settings).length === 0
    : true;

  const canSubmit = nameValid && Boolean(gameId) && settingsValid;

  const submit = async () => {
    if (!canSubmit) return;
    setPending(true);
    try {
      const result = await createServer({
        game: gameId,
        name: trimmedName,
        settings,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.push(`/dashboard/${result.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create server"
      );
    } finally {
      setPending(false);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (step < STEPS.length - 1) {
      if (stepValid[step]) setStep(step + 1);
    } else {
      submit();
    }
  };

  const isLast = step === STEPS.length - 1;

  return (
    <>
      <PageHeader title="New server">
        <StepIndicator step={step} />
      </PageHeader>
      <PageBody>
        <form onSubmit={handleSubmit} className="space-y-6">
          {step === 0 && (
            <GameStep games={games} gameId={gameId} setGameId={setGameId} />
          )}

          {step === 1 && (
            <NameStep
              name={name}
              setName={setName}
              selectedGame={selectedGame}
              settings={settings}
              setSettingField={setSettingField}
            />
          )}

          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0 || pending}
            >
              Back
            </Button>
            <Button type="submit" disabled={!stepValid[step] || pending}>
              {submitLabel(isLast, pending)}
            </Button>
          </div>
        </form>
      </PageBody>
    </>
  );
};
