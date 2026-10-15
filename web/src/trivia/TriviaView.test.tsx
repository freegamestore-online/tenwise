import { describe, expect, it, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TriviaView } from "./TriviaView";
import { currentQuestion, startGame, utcDate } from "./engine";
import { loadDaily } from "./saves";

beforeEach(() => {
  localStorage.clear();
});

describe("TriviaView", () => {
  it("starts a daily round and shows the first question with its options", () => {
    render(<TriviaView />);
    fireEvent.click(screen.getByRole("button", { name: /Daily ten/ }));

    const expected = currentQuestion(startGame({ kind: "daily", date: utcDate() }))!;
    expect(screen.getByRole("heading", { name: expected.question })).toBeInTheDocument();
    for (const option of expected.options) {
      expect(screen.getByRole("button", { name: option })).toBeInTheDocument();
    }
  });

  it("marks a correct pick and saves the daily progress", () => {
    render(<TriviaView />);
    fireEvent.click(screen.getByRole("button", { name: /Daily ten/ }));

    const q = currentQuestion(startGame({ kind: "daily", date: utcDate() }))!;
    fireEvent.click(screen.getByRole("button", { name: q.options[q.correctIndex]! }));

    expect(screen.getByText(/Correct! \+100/)).toBeInTheDocument();
    expect(loadDaily(utcDate())?.results).toHaveLength(1);
  });

  it("reveals the correct answer after a wrong pick", () => {
    render(<TriviaView />);
    fireEvent.click(screen.getByRole("button", { name: /Daily ten/ }));

    const q = currentQuestion(startGame({ kind: "daily", date: utcDate() }))!;
    const wrong = q.options.findIndex((_, i) => i !== q.correctIndex);
    fireEvent.click(screen.getByRole("button", { name: q.options[wrong]! }));

    expect(screen.getByText(new RegExp(`The answer was ${escape(q.options[q.correctIndex]!)}`))).toBeInTheDocument();
  });

  it("offers category practice and survival from the menu", () => {
    render(<TriviaView />);
    expect(screen.getByRole("combobox", { name: "Category" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Survival/ }));
    expect(screen.getByText(/Lives/)).toBeInTheDocument();
  });
});

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
