import { Action, ActionPanel, List } from "@raycast/api";
import { useFetch } from "@raycast/utils";
import { parseKeymaps, type Section } from "./parse-keymaps";

const KEYMAPS_URL = "https://www.lazyvim.org/keymaps";

export default function Command() {
  const { data, isLoading } = useFetch(KEYMAPS_URL, {
    parseResponse: async (response) => parseKeymaps(await response.text()),
    initialData: [] as Section[],
    keepPreviousData: true,
    failureToastOptions: { title: "Could not load LazyVim keymaps" },
  });

  const sections: Section[] = data ?? [];

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search key, description or mode…"
    >
      {sections.map((section) => (
        <List.Section
          key={section.name}
          title={section.name}
          subtitle={String(section.keymaps.length)}
        >
          {section.keymaps.map((keymap, index) => (
            <List.Item
              key={`${section.name}-${index}-${keymap.key}`}
              title={keymap.key}
              subtitle={keymap.description}
              accessories={[{ tag: keymap.mode }]}
              keywords={[
                keymap.description,
                keymap.mode,
                section.name,
                ...keymap.description.split(/\s+/),
              ]}
              actions={
                <ActionPanel>
                  <Action.CopyToClipboard
                    title="Copy Key"
                    content={keymap.key}
                  />
                  <Action.CopyToClipboard
                    title="Copy Description"
                    content={keymap.description}
                  />
                  <Action.OpenInBrowser
                    title="Open Lazyvim.org/keymaps"
                    url={KEYMAPS_URL}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ))}
    </List>
  );
}
