import { describe, expect, it } from "vitest";
import {
  addMcpServer,
  connectBuiltinServer,
  disconnectBuiltinServer,
  type Customization,
  enabledToolNames,
  findMcpServer,
  isMcpConnected,
  isServerUrl,
  isSkillEnabled,
  removeMcpServer,
  setMcpServerEnabled,
  setSkillEnabled,
  setToolEnabled,
  userMcpServers,
} from "./customize";

const BASE: Customization = {
  mcpServers: [],
  disabledSkills: [],
  disabledTools: [],
};

describe("customize store helpers", () => {
  it("validates server urls", () => {
    expect(isServerUrl("https://connect.composio.dev/mcp")).toBe(true);
    expect(isServerUrl("http://localhost:8787/mcp")).toBe(true);
    expect(isServerUrl("not a url")).toBe(false);
    expect(isServerUrl("ftp://files.example.com")).toBe(false);
    expect(isServerUrl("")).toBe(false);
  });

  it("adds servers once and rejects bad input", () => {
    const added = addMcpServer(
      BASE,
      "Composio",
      "https://connect.composio.dev/mcp",
    );
    expect(added.error).toBeUndefined();
    expect(added.next.mcpServers).toHaveLength(1);
    expect(added.next.mcpServers[0].enabled).toBe(true);

    expect(
      addMcpServer(added.next, "Again", "https://connect.composio.dev/mcp")
        .error,
    ).toMatch(/already added/);
    expect(addMcpServer(BASE, "", "https://example.com/mcp").error).toMatch(
      /Name/,
    );
    expect(addMcpServer(BASE, "X", "notaurl").error).toMatch(/http/);
  });

  it("removes servers and flips the enabled switch", () => {
    const added = addMcpServer(
      BASE,
      "Composio",
      "https://connect.composio.dev/mcp",
    ).next;
    const id = added.mcpServers[0].id;
    expect(
      setMcpServerEnabled(added, id, false).mcpServers[0].enabled,
    ).toBe(false);
    expect(removeMcpServer(added, id).mcpServers).toHaveLength(0);
  });

  it("keeps catalog connections out of the Yours list", () => {
    expect(isMcpConnected(BASE, "composio")).toBe(false);
    expect(
      connectBuiltinServer(
        BASE,
        "composio",
        "Composio",
        "https://connect.composio.dev/mcp",
        "",
      ).error,
    ).toMatch(/API key/);
    const connected = connectBuiltinServer(
      BASE,
      "composio",
      "Composio",
      "https://connect.composio.dev/mcp",
      "key-123",
    ).next;
    expect(isMcpConnected(connected, "composio")).toBe(true);
    expect(userMcpServers(connected)).toHaveLength(0);
    expect(findMcpServer(connected, "composio")?.apiKey).toBe("key-123");
    expect(
      addMcpServer(connected, "Composio", "https://connect.composio.dev/mcp")
        .error,
    ).toMatch(/already added/);
    expect(
      userMcpServers(disconnectBuiltinServer(connected, "composio")),
    ).toHaveLength(0);
    expect(
      isMcpConnected(disconnectBuiltinServer(connected, "composio"), "composio"),
    ).toBe(false);
  });

  it("toggles skills and tools without duplicates", () => {
    const off = setSkillEnabled(BASE, "research", false);
    expect(isSkillEnabled(off, "research")).toBe(false);
    expect(isSkillEnabled(off, "shopping")).toBe(true);
    const backOn = setSkillEnabled(
      setSkillEnabled(off, "research", false),
      "research",
      true,
    );
    expect(backOn.disabledSkills).toHaveLength(0);

    const toolsOff = setToolEnabled(BASE, "web_search", false);
    expect(
      setToolEnabled(toolsOff, "web_search", false).disabledTools,
    ).toHaveLength(1);
    expect(
      enabledToolNames(["web_search", "calculator"], toolsOff.disabledTools),
    ).toEqual(["calculator"]);
  });

  it("sends no tool filter when everything stays enabled", () => {
    expect(enabledToolNames(["a", "b"], [])).toBeUndefined();
    expect(enabledToolNames(["a", "b"], ["a", "b"])).toEqual([]);
  });
});
