import { describe, expect, it } from "vitest";

import { createNextConfig } from "./next.config";

describe("desktop build configuration", () => {
  it("stamps desktop mode into the packaged server bundle", () => {
    const config = createNextConfig(true);

    expect(config.output).toBe("standalone");
    expect(config.compiler?.defineServer).toMatchObject({
      "process.env.ANW_DESKTOP_MODE": "1",
    });
    expect(config.experimental?.serverActions?.bodySizeLimit).toBe("10mb");
  });

  it("does not enable desktop mode for the hosted website", () => {
    const config = createNextConfig(false);

    expect(config.output).toBeUndefined();
    expect(config.compiler?.defineServer).toBeUndefined();
    expect(config.experimental?.serverActions?.bodySizeLimit).toBe("1mb");
  });
});
