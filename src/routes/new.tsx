import { createFileRoute } from "@tanstack/react-router";
import { CharacterEditor } from "@/components/CharacterEditor";

export const Route = createFileRoute("/new")({
  head: () => ({
    meta: [
      { title: "Новый персонаж — Летопись героев" },
      { name: "description", content: "Создайте героя: имя, раса, класс и распределение стартовых 1000 опыта." },
      { property: "og:title", content: "Новый персонаж — Летопись героев" },
      { property: "og:description", content: "Создание персонажа для домашней RPG-системы." },
    ],
  }),
  component: CharacterEditor,
});
