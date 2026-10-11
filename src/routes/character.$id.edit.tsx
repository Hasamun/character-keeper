import { createFileRoute, Link } from "@tanstack/react-router";
import { CharacterEditor } from "@/components/CharacterEditor";
import { useCharacters } from "@/lib/characters-store";

export const Route = createFileRoute("/character/$id/edit")({
  head: () => ({
    meta: [
      { title: "Редактирование персонажа — Летопись героев" },
      { name: "description", content: "Измените имя, расу, класс и аватар персонажа." },
      { property: "og:title", content: "Редактирование персонажа — Летопись героев" },
      { property: "og:description", content: "Редактирование персонажа." },
    ],
  }),
  component: EditPage,
});

function EditPage() {
  const { id } = Route.useParams();
  const { ready, get } = useCharacters();
  if (!ready) return null;
  const c = get(id);
  if (!c) return <div className="p-10 text-center">Персонаж не найден. <Link to="/" className="text-primary">На главную</Link></div>;
  return <CharacterEditor key={c.id} initial={c} />;
}
