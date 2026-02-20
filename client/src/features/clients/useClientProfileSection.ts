import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearch } from "wouter";
import type { ClientProfileSection } from "./clientProfileSections";

function storageKey(clientId: string) {
  return `client-profile-section:${clientId}`;
}

export function useClientProfileSection(visibleSections: ClientProfileSection[], clientId: string) {
  const searchString = useSearch();

  const validIds = useMemo(() => new Set(visibleSections.map((s) => s.id)), [visibleSections]);

  const getInitialSection = (): string => {
    const params = new URLSearchParams(searchString);
    const fromUrl = params.get("section");
    if (fromUrl && validIds.has(fromUrl)) return fromUrl;

    if (clientId) {
      try {
        const stored = localStorage.getItem(storageKey(clientId));
        if (stored && validIds.has(stored)) return stored;
      } catch {}
    }

    return "overview";
  };

  const [activeSection, setActiveSectionRaw] = useState(getInitialSection);

  useEffect(() => {
    if (!validIds.has(activeSection)) {
      setActiveSectionRaw("overview");
    }
  }, [validIds, activeSection]);

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const fromUrl = params.get("section");
    if (fromUrl && validIds.has(fromUrl) && fromUrl !== activeSection) {
      setActiveSectionRaw(fromUrl);
    }
  }, [searchString, validIds]);

  const setActiveSection = useCallback(
    (sectionId: string) => {
      if (!validIds.has(sectionId)) return;
      setActiveSectionRaw(sectionId);

      if (clientId) {
        try {
          localStorage.setItem(storageKey(clientId), sectionId);
        } catch {}
      }

      const currentPath = window.location.pathname;
      const params = new URLSearchParams(window.location.search);
      if (sectionId === "overview") {
        params.delete("section");
      } else {
        params.set("section", sectionId);
      }
      const qs = params.toString();
      const newUrl = qs ? `${currentPath}?${qs}` : currentPath;
      window.history.replaceState(null, "", newUrl);
    },
    [validIds, clientId],
  );

  return { activeSection, setActiveSection };
}
