import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemberUsageCharts } from "./member-usage-charts";
import { summarizeMemberUsage, type MemberUsageDay } from "@/lib/domain/member-usage";

const rows: MemberUsageDay[] = [
  { team_id: "team", member_id: "anna", usage_date: "2026-10-01", active_minutes: 30, sessions: 1 },
  { team_id: "team", member_id: "ben", usage_date: "2026-10-01", active_minutes: 60, sessions: 2 },
  { team_id: "team", member_id: "ben", usage_date: "2026-10-03", active_minutes: 120, sessions: 1 },
];
const memberNames = { anna: "Anna", ben: "Ben" };

function renderCharts(data = rows, start = "2026-10-01", end = "2026-10-03") {
  return render(<MemberUsageCharts rows={data} summaries={summarizeMemberUsage(data)} memberNames={memberNames} start={start} end={end} />);
}

describe("member usage charts", () => {
  it("aggregates the team by UTC day, retains gaps, and ranks members", () => {
    renderCharts();
    const chart = screen.getByRole("img", { name: /Daily active hours for All members/ });
    const bars = chart.querySelectorAll("rect");
    expect(bars).toHaveLength(3);
    expect(bars[0]).toHaveTextContent("2026-10-01: 1.50 hours (90 minutes)");
    expect(bars[1]).toHaveAttribute("height", "0");
    expect(bars[2]).toHaveTextContent("2026-10-03: 2.00 hours (120 minutes)");
    expect(screen.getByText("3.50 hours · All members · UTC")).toBeInTheDocument();
    const ranking = screen.getByRole("list");
    expect(within(ranking).getAllByRole("listitem")[0]).toHaveTextContent("Ben3.00 h");
    expect(within(ranking).getAllByRole("listitem")[1]).toHaveTextContent("Anna0.50 h");
  });

  it("filters daily time by member without changing the team comparison", () => {
    renderCharts();
    fireEvent.change(screen.getByLabelText("Chart member"), { target: { value: "anna" } });
    const bars = screen.getByRole("img", { name: /Daily active hours for Anna/ }).querySelectorAll("rect");
    expect(bars[0]).toHaveTextContent("0.50 hours (30 minutes)");
    expect(bars[2]).toHaveAttribute("height", "0");
    expect(screen.getByText("0.50 hours · Anna · UTC")).toBeInTheDocument();
    expect(screen.getByText("3.00 h")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Chart member"), { target: { value: "" } });
    expect(screen.getByRole("img", { name: /Daily active hours for All members/ })).toBeInTheDocument();
  });

  it("handles a one-day zero-minute range with a finite scale and exact data alternative", () => {
    const view = renderCharts([{ ...rows[0], active_minutes: 0 }], "2026-10-01", "2026-10-01");
    const bar = screen.getByRole("img").querySelector("rect");
    expect(bar).toHaveAttribute("height", "0");
    expect(bar).toHaveAttribute("y", "180");
    expect(view.container.innerHTML).not.toMatch(/NaN|Infinity/);
    const details = screen.getByText("View daily data").closest("details")!;
    const table = details.querySelector("table")!;
    expect(table).toHaveTextContent("Daily usage for All members, UTC");
    expect(table).toHaveTextContent("2026-10-010.00");
  });

  it("keeps exact recorded minutes alongside rounded hours in the data alternative", () => {
    renderCharts([{ ...rows[0], active_minutes: 1 }], "2026-10-01", "2026-10-01");
    const table = screen.getByText("View daily data").closest("details")!.querySelector("table")!;
    expect(table).toHaveTextContent("Recorded minutes");
    const cells = table.querySelectorAll("tbody td");
    expect(cells[0]).toHaveTextContent("0.02");
    expect(cells[1]).toHaveTextContent(/^1$/);
  });
});
