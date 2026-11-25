import type { Dictionary } from "./en";

export const fr: Dictionary = {
  app: { name: "Your League Coach" },
  nav: {
    group: "Coach",
    home: "Accueil",
    draft: "Draft",
    build: "Build",
    inGame: "En partie",
    settings: "Réglages",
    collapse: "Réduire le menu",
    expand: "Agrandir le menu",
    open: "Ouvrir le menu",
  },
  theme: {
    toggle: "Changer de thème",
    light: "Clair",
    dark: "Sombre",
    system: "Système",
  },
  client: {
    state: {
      connected: "Connecté",
      searching: "Recherche",
      disconnected: "Déconnecté",
    },
    badge: {
      connected: "Client connecté",
      searching: "Recherche du client",
      disconnected: "Client déconnecté",
    },
  },
  phase: {
    None: "Hors partie",
    Lobby: "Salon",
    Matchmaking: "File d'attente",
    CheckedIntoTournament: "Tournoi",
    ReadyCheck: "Partie trouvée",
    ChampSelect: "Sélection des champions",
    GameStart: "Lancement de la partie",
    FailedToLaunch: "Échec du lancement",
    InProgress: "En partie",
    Reconnect: "Reconnexion",
    WaitingForStats: "Fin de partie",
    PreEndOfGame: "Fin de partie",
    EndOfGame: "Fin de partie",
    TerminatedInError: "Partie interrompue",
    Unknown: "État inconnu",
  },
  patch: { badge: "Patch {patch}" },
  server: {
    error: {
      unreachable: "Aucune réponse du serveur de coaching.",
      failed: "Le serveur de coaching a répondu par une erreur.",
      unauthorized: "Le serveur de coaching a refusé la clé d'accès.",
      retry: "Réessayer",
      openSettings: "Ouvrir les réglages",
    },
  },
  home: {
    client: {
      title: "Client League",
      detail: {
        connected: "Le draft s'ouvre tout seul en sélection des champions.",
        auto: "Lockfile\u00a0: détection automatique",
        custom: "Lockfile\u00a0: chemin personnalisé",
      },
    },
    server: {
      title: "Serveur de coaching",
      value: {
        online: "En ligne",
        unreachable: "Injoignable",
        unauthorized: "Clé refusée",
        unconfigured: "À configurer",
        failed: "Erreur",
      },
      badge: {
        online: "Clé acceptée",
        unreachable: "Sans réponse",
        unauthorized: "Non autorisé",
        unconfigured: "Réglages requis",
        failed: "Erreur serveur",
      },
      openSettings: "Ouvrir les réglages",
      fixKey: "Corriger la clé d'accès",
      retry: "Réessayer",
    },
    patch: {
      title: "Patch",
      none: "Aucun",
      games: "Parties analysées\u00a0: Faille {sr} / ARAM {aram}",
      waitingCollector: "Le collecteur n'a pas encore détecté de patch.",
      needsServer: "Affiché dès que le serveur répond.",
      fresh: "À jour",
      stale: "Obsolète",
    },
    collector: {
      title: "Statistiques peut-être obsolètes",
      stale: "Dernière agrégation\u00a0: {when}.",
      never: "Le collecteur n'a encore agrégé aucune partie.",
      error: "Dernière erreur du collecteur ({when})\u00a0:",
      errorUndated: "Dernière erreur du collecteur\u00a0:",
    },
    empty: {
      title: "Client League introuvable",
      description:
        "Lance League of Legends\u00a0: la connexion se fait toute seule.",
      action: "Indiquer le chemin du lockfile",
    },
  },
  settings: {
    connection: {
      title: "Connexion",
      description:
        "Serveur partagé et clé d'accès, fournis par la personne qui héberge le serveur.",
    },
    serverUrl: {
      title: "URL du serveur",
      description: "Adresse du serveur de coaching partagé.",
      placeholder: "coach.exemple.fr",
      errors: {
        invalid: "Saisis une adresse de serveur valide.",
        insecure:
          "HTTPS obligatoire. HTTP n'est accepté que pour localhost et 127.0.0.1.",
        credentials: "Ne mets ni identifiant ni mot de passe dans l'adresse.",
      },
    },
    accessKey: {
      title: "Clé d'accès",
      description: "Clé partagée, envoyée avec chaque requête.",
      errors: {
        length: "La clé est trop longue.",
        characters:
          "La clé contient des caractères qui ne peuvent pas être envoyés.",
      },
    },
    test: {
      title: "Test de connexion",
      description:
        "Vérifie l'adresse et la clé ci-dessus sans les enregistrer.",
      action: "Tester la connexion",
      success: "Serveur joignable, clé acceptée (patch {patch}).",
      successNoPatch: "Serveur joignable, clé acceptée.",
      unauthorized: "Le serveur a refusé cette clé d'accès (non autorisé).",
      unreachable: "Aucune réponse de {host}.",
      failed: "Le serveur a répondu par une erreur.",
      missing: "Saisis d'abord l'URL du serveur et la clé d'accès.",
    },
    save: "Enregistrer",
    reset: "Réinitialiser",
    saved: "Réglages enregistrés.",
    saveFailed: "Impossible d'enregistrer les réglages.",
    preferences: {
      title: "Préférences",
      description: "Elles s'appliquent dès que tu les changes.",
      general: "Général",
    },
    language: {
      title: "Langue",
      description: "Auto suit la langue de ton client League.",
      auto: "Auto",
      fr: "Français",
      en: "English",
      descriptionDetected:
        "Détectée\u00a0: {language}. Auto suit la langue de ton client League.",
    },
    autoImport: {
      title: "Import automatique",
      description:
        "Envoie runes, sorts et objets au client quand tu verrouilles ton champion.",
    },
    lockfile: {
      title: "Chemin du lockfile",
      description: "Laisse vide pour trouver le client League automatiquement.",
      placeholder: "Automatique",
      saved: "Chemin du lockfile mis à jour.",
    },
    loadFailed: {
      title: "Impossible de charger les réglages",
      description: "L'application ne peut pas lire son fichier de réglages.",
      retry: "Réessayer",
    },
  },
  draft: {
    idle: {
      title: "Aucun draft en cours",
      description:
        "Les suggestions de bans et de picks s'affichent ici pendant la sélection des champions.",
    },
    unsupported: {
      title: "Mode non pris en charge",
      description:
        "Les suggestions couvrent les parties classées, le draft normal et l'ARAM.",
    },
    aram: {
      title: "ARAM - build uniquement",
      description:
        "L'ARAM n'a ni bans ni ordre de pick\u00a0: il n'y a rien à suggérer ici.",
    },
    teams: {
      allies: "Ton équipe",
      enemies: "Équipe adverse",
      you: "Toi",
      ally: "Allié {number}",
      enemy: "Adversaire {number}",
      notPicked: "Pas choisi",
      notRevealed: "Non révélé",
      hovering: "Survol",
      likelyRole: "~{role}",
      likelyRoleHint: "Rôle probable\u00a0: {role}",
      bans: "Bans",
      noBans: "Aucun ban",
      unknownChampion: "Champion {id}",
    },
    roles: {
      TOP: "Top",
      JUNGLE: "Jungle",
      MIDDLE: "Mid",
      BOTTOM: "Bot",
      UTILITY: "Support",
    },
    rolePicker: "Ton rôle",
    suggestions: {
      picks: "Suggestions de picks",
      bans: "Suggestions de bans",
      info: {
        label: "Comment le score est calculé",
        picks:
          "Force sur le patch, matchups, synergies et ton pool, en points de taux de victoire. Barre pleine à +{full}.",
        bans: "Force sur le patch et menace pour tes meilleurs champions, en points de taux de victoire. Barre pleine à +{full}.",
      },
      score: "Score",
      points: "{points} pts",
      winRate: "Taux de victoire",
      games: { one: "{count} partie", other: "{count} parties" },
      components: {
        strength: "Force sur le patch",
        matchup: "Matchups",
        synergy: "Synergie",
        pool: "Ton pool",
      },
      moreReasons: "+{count}",
      blended: "Patch {patch} + {previous}, {games} parties",
      blendedUnnamed: "Patch {patch} + patch précédent, {games} parties",
      needRole: {
        title: "Quel rôle joues-tu\u00a0?",
        description:
          "Les suggestions de picks dépendent de ton rôle. Choisis-le ci-dessus.",
      },
      empty: {
        title: "Aucune suggestion pour ce draft",
        description:
          "Trop peu de parties analysées pour ce rôle sur le patch actuel.",
      },
      error: { title: "Suggestions indisponibles" },
      unconfigured: {
        title: "Serveur de coaching à configurer",
        description:
          "Saisis l'adresse du serveur et la clé d'accès pour obtenir des suggestions.",
        action: "Ouvrir les réglages",
      },
    },
  },
  build: {
    idle: {
      title: "Aucun champion sélectionné",
      description:
        "Le build recommandé s'affiche ici dès que tu survoles ou verrouilles un champion.",
    },
    title: "Build recommandé",
    sample: {
      games: {
        one: "Patch {patch} · {count} partie",
        other: "Patch {patch} · {count} parties",
      },
      blended: "Patch {patch} + patch précédent · {games} parties",
    },
    unconfigured: {
      title: "Serveur de coaching à configurer",
      description:
        "Saisis l'adresse du serveur et la clé d'accès pour obtenir le build.",
      action: "Ouvrir les réglages",
    },
    empty: {
      title: "Pas encore de build pour ce champion",
      description:
        "Trop peu de parties analysées pour ce champion sur le patch actuel.",
    },
    error: { title: "Build indisponible" },
    runes: {
      title: "Runes",
      shards: "Fragments",
      shard: {
        healthScaling: "PV selon le niveau",
        attackSpeed: "Vitesse d'attaque",
        abilityHaste: "Accélération de compétence",
        adaptiveForce: "Force adaptative",
        moveSpeed: "Vitesse de déplacement",
        health: "PV",
        tenacity: "Ténacité et résistance aux ralentissements",
      },
    },
    spells: { title: "Sorts d'invocateur" },
    skills: {
      title: "Compétences",
      opening: "Niveaux 1 à 3",
      maxOrder: "Ordre de max",
      grid: "Compétence à monter à chaque niveau",
    },
    items: {
      title: "Objets",
      order: "Ordre d'achat",
      slots: {
        starter: "Départ",
        boots: "Bottes",
        core: "Core",
        situational: "Situationnels",
      },
      coreStep: "Core {rank}",
      stack: "{item} ×{count}",
      adjustments: "Ajustés pour ce draft",
      noAdjustments: "Aucun ajustement pour les champions révélés jusqu'ici.",
      replaces: "Remplace {item}",
      added: "Ajouté au build",
    },
    unknown: {
      item: "Objet {id}",
      rune: "Rune {id}",
      shard: "Fragment {id}",
      spell: "Sort {id}",
    },
    import: {
      action: "Importer dans le client",
      done: {
        runes: "Runes importées",
        spells: "Sorts d'invocateur réglés",
        items: "Objets importés",
      },
      failed: {
        runes: "Runes non importées",
        spells: "Sorts d'invocateur non réglés",
        items: "Objets non importés",
      },
      noFreePage: {
        title: "Aucune page de runes libre",
        description:
          "Tous les emplacements de pages de runes sont pris par tes propres pages. Supprimes-en une dans le client League, puis réimporte. L'application ne remplace que les pages qu'elle a créées.",
      },
    },
  },
  inGame: {
    idle: {
      title: "Aucune partie en cours",
      description: "Tes prochains objets s'affichent ici pendant une partie.",
    },
    reading: {
      title: "Partie détectée",
      description:
        "Les données de la partie sont encore en cours de lecture. Tes prochains objets s'affichent dès qu'elles sont lues.",
    },
    title: "Partie en cours",
    alwaysOnTop: {
      label: "Toujours au premier plan",
      on: "Activé",
      off: "Désactivé",
      failed: "Impossible de changer l'affichage au premier plan",
    },
    unconfigured: {
      title: "Serveur de coaching à configurer",
      description:
        "Saisis l'adresse du serveur et la clé d'accès pour obtenir tes prochains objets.",
      action: "Ouvrir les réglages",
    },
    next: {
      title: "Prochains objets",
      unknownChampion: {
        title: "Champion non reconnu",
        description:
          "L'application ne retrouve pas ce champion dans Data Dragon\u00a0: elle n'a rien à suggérer.",
      },
      complete: {
        title: "Plus rien à acheter",
        description: "Tu possèdes tous les objets du build recommandé.",
      },
      error: { title: "Prochains objets indisponibles" },
      outdated: {
        title: "Prochains objets non actualisés",
        note: "Ce qui suit est la dernière réponse reçue.",
      },
    },
    owned: { title: "Tes objets" },
    enemies: { none: "Aucun adversaire dans cette partie." },
    noItems: "Aucun objet pour l'instant",
  },
  reasons: {
    strong_on_patch: "Bon sur le patch",
    in_your_pool: "Dans ton pool",
    balances_damage: "Équilibre les dégâts de l'équipe",
    anti_heal: "Anti-soin",
    armor_vs_ad: "Armure contre les dégâts physiques",
    mr_vs_ap: "Résistance magique contre les dégâts magiques",
    tenacity_vs_cc: "Ténacité contre les contrôles",
    frontline_missing: "L'équipe manque d'une première ligne",
    penetration_vs_tanks: "Pénétration contre les tanks",
    counters: "Contre {champion}",
    countered_by: "Contré par {champion}",
    synergy: "Synergie avec {champion}",
  },
  legal: {
    title: "Mentions légales",
    notice:
      "Your League Coach n'est pas approuvé par Riot Games et ne reflète pas les points de vue ou les opinions de Riot Games ni de quiconque officiellement impliqué dans la production ou la gestion des propriétés de Riot Games. Riot Games et toutes les propriétés associées sont des marques commerciales ou des marques déposées de Riot Games, Inc.",
    official: "Texte officiel (anglais)\u00a0:",
  },
};
