import { redirect } from "next/navigation";

import { games } from "@/games";
import { requireUser } from "@/lib/session";

import { NewServerForm } from "./components/form";
import type { GameOption } from "./components/form";

const NewServerPage = async () => {
  await requireUser();

  const gameOptions: GameOption[] = games
    .filter((g) => g.enabled)
    .map((g) => ({
      description: g.description,
      id: g.id,
      image: g.image,
      name: g.name,
      requirements: {
        cpu: g.requirements.cpu,
        disk: g.requirements.disk,
        memory: g.requirements.memory,
      },
      settings: g.settings,
    }));

  return <NewServerForm games={gameOptions} />;
};

export default NewServerPage;
