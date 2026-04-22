import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearch } from "wouter";
import type { ClientProfileSection } from "./clientProfileSections";

function storageKey(clientId: string) {
  return `client-profile-section:${clientId}`;
}

export function normalizeClientProfileSection(
  sectionId: string | null | undefined,
  validIds: Set<string>,
): string {
  if (sectionId && validIds.has(sectionId)) {
    return sectionId;
  }
  return "overview";
}

function writeSectionState(clientId: string, sectionId: string) {
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
}

export function useClientProfileSection(visibleSections: ClientProfileSection[], clientId: string) {
  const searchString = useSearch();

  const validIds = useMemo(() => new Set(visibleSections.map((s) => s.id)), [visibleSections]);

  const getInitialSection = (): string => {
    const params = new URLSearchParams(searchString);
    const fromUrl = params.get("section");
    const normalizedFromUrl = normalizeClientProfileSection(fromUrl, validIds);
    if (normalizedFromUrl !== "overview" || fromUrl === "overview") return normalizedFromUrl;

    if (clientId) {
      try {
        const stored = localStorage.getItem(storageKey(clientId));
        return normalizeClientProfileSection(stored, validIds);
      } catch {}
    }

    return "overview";
  };

  const [activeSection, setActiveSectionRaw] = useState(getInitialSection);

  useEffect(() => {
    if (normalizeClientProfileSection(activeSection, validIds) !== activeSection) {
      setActiveSectionRaw("overview");
      writeSectionState(clientId, "overview");
    }
  }, [validIds, activeSection, clientId]);

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const fromUrl = params.get("section");
    if (!fromUrl) return;

    const normalized = normalizeClientProfileSection(fromUrl, validIds);
    if (normalized !== fromUrl) {
      setActiveSectionRaw("overview");
      writeSectionState(clientId, "overview");
      return;
    }

    if (fromUrl !== activeSection) {
      setActiveSectionRaw(fromUrl);
    }
  }, [searchString, validIds, activeSection, clientId]);

  const setActiveSection = useCallback(
    (sectionId: string) => {
      if (!validIds.has(sectionId)) return;
      setActiveSectionRaw(sectionId);
      writeSectionState(clientId, sectionId);
    },
    [validIds, clientId],
  );

  return { activeSection, setActiveSection };
}
