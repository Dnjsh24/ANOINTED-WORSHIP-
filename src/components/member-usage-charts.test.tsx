import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemberUsageCharts } from "./member-usage-charts";
import { summarizeMemberUsage, type MemberUsageDay } from "@/lib/domain/member-usage";

const rows: MemberUsageDay[] = [
  { team_id: "team", member_id: "anna", usage_date: "2026-10-01", active_minutes: 30, sessions: 1 },
  { team_id: "team", member_id: "ben", usage_date: "2026-10-01", active_minutes: 60, sessions: 2 },
  { team_id: "team", member_id: "ben", usage_date: "2026-10-03", active_minutes: 120, sessions: 1 },
];
const memberNames = { anna: "Anna", ben: "Ben", cara: "Cara" };

function renderCharts(data = rows, start = "2026-10-01", end = "2026-10-03") {
  return render(<MemberUsageCharts rows={data} summaries={summarizeMemberUsage(data)} memberNames={memberNames} start={start} end={end} />);
}

describe("member usage charts", () => {
  it("shows each roster member in the daily series and retains zero-activity members", () => {
    renderCharts();
    const chart = screen.getByRole("img", { name: /Daily active hours by member for All members/ });
    const bars = chart.querySelectorAll("rect[data-member-id]");

    expect(Array.from(bars, (bar) => `${bar.getAttribute("data-member-id")}:${bar.getAttribute("data-usage-date")}`)).toEqual([
      "anna:2026-10-01",
      "ben:2026-10-01",
      "ben:2026-10-03",
    ]);
    expect(screen.getByText("3.50 hours · All members · UTC")).toBeInTheDocument();
    expect(screen.getByText("Cara: 0.00 hours")).toBeInTheDocument();

    const ranking = screen.getByRole("list", { name: "Active hours by member" });
    expect(within(ranking).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Ben3.00 h",
      "Anna0.50 h",
      "Cara0.00 h",
    ]);
  });

  it("filters daily data by one member without changing the complete team comparison", () => {
    renderCharts();
    fireEvent.change(screen.getByLabelText("Chart member"), { target: { value: "anna" } });

    const chart = screen.getByRole("img", { name: /Daily active hours by member for Anna/ });
    expect(Array.from(chart.querySelectorAll("rect[data-member-id]"), (bar) => bar.getAttribute("data-member-id"))).toEqual(["anna"]);
    expect(screen.getByText("0.50 hours · Anna · UTC")).toBeInTheDocument();
    expect(screen.getByText("3.00 h")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Chart member"), { target: { value: "" } });
    expect(screen.getByRole("img", { name: /Daily active hours by member for All members/ })).toBeInTheDocument();
  });

  it("handles a one-day zero-minute range with a finite scale and exact data alternative", () => {
    const view = renderCharts([{ ...rows[0], active_minutes: 0 }], "2026-10-01", "2026-10-01");
    const chart = screen.getByRole("img", { name: /Daily active hours by member/ });
    expect(chart.querySelectorAll("rect[data-member-id]")).toHaveLength(0);
    expect(view.container.innerHTML).not.toMatch(/NaN|Infinity/);

    fireEvent.click(screen.getByText("View daily data"));
    const table = screen.getByRole("table", { name: "Daily usage for All members, UTC" });
    expect(table).toHaveTextContent("2026-10-01");
    expect(within(table).getByRole("cell", { name: "Anna: 0.00 hours, 0 recorded minutes" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "Cara: 0.00 hours, 0 recorded minutes" })).toBeInTheDocument();
  });

  it("keeps exact recorded minutes beside each member's approximate daily hours", () => {
    renderCharts([{ ...rows[0], active_minutes: 1 }], "2026-10-01", "2026-10-01");
    fireEvent.click(screen.getByText("View daily data"));
    const table = screen.getByRole("table", { name: "Daily usage for All members, UTC" });

    expect(within(table).getByRole("cell", { name: "Anna: 0.02 hours, 1 recorded minutes" })).toHaveTextContent("0.02 h (1 min)");
  });
});
