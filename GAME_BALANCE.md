# Game Balance - Coûts, Formules & Boosts

---

## FORMULES GENERALES

### Coût de construction/recherche (niveau N)
```
coût = baseCost × costFactor^N
```
Appliqué séparément à chaque ressource (fer, silice, xenogas).

### Temps de construction (bâtiments)
```
temps_brut = baseTime × timeFactor^N
réduction = 1 / (1 + roboticsLevel × 0.1)
temps_final = max(5s, floor(temps_brut × réduction))
```
- `roboticsLevel` = niveau de l'Automata Foundry

### Temps de recherche
```
temps = baseTime × timeFactor^N
```
(Pas de réduction par bâtiment pour le moment)

### Coût en Xylos (accélération)
```
xylos = max(1, ceil(secondes_restantes / 30))
```

---

## PRODUCTION DE RESSOURCES

### Ferro Mine (fer)
```
production/h = 30 × level × 1.1^level × energyRatio × (1 + plasmaBonus_fer)
+ 10 (production de base passive)
```

### Silica Mine (silice)
```
production/h = 20 × level × 1.1^level × energyRatio × (1 + plasmaBonus_silice)
+ 5 (production de base passive)
```

### Xeno Well (xenogas)
```
production/h = 10 × level × 1.1^level × energyRatio × (1 + plasmaBonus_xenogas)
```

### Energy Ratio
```
energyRatio = min(1, energyProduite / energieConsommée)
```
Si `energieConsommée = 0`, alors `energyRatio = 1`.

---

## ENERGIE

### Production - Power Plant (niveau N)
```
énergie = floor(20 × N × 1.1^N × (1 + quantumFluxLevel × 0.05))
```

### Production - Helios Remorqueur
```
énergie = 30 par unité
```

### Consommation - Ferro Mine (niveau N)
```
consommation = floor(10 × N × 1.1^N)
```

### Consommation - Silica Mine (niveau N)
```
consommation = floor(10 × N × 1.1^N)
```

### Consommation - Xeno Well (niveau N)
```
consommation = floor(20 × N × 1.1^N)
```

---

## CAPACITE DE STOCKAGE

### Formule (Ferro Store / Silica Store / Xeno Store)
```
capacité = 5000 × floor(2.5 × e^(20 × level / 33))
```

---

## BOOSTS DE RECHERCHE

### Surchauffe Plasmatique (plasmaOverdrive) - Bonus production
```
bonus_fer     = level × 1%     (× 0.01)
bonus_silice  = level × 0.66%  (× 0.0066)
bonus_xenogas = level × 0.33%  (× 0.0033)
```

### Flux Quantique (quantumFlux) - Bonus énergie
```
bonus_énergie = level × 5% (× 0.05)
```
Multiplie la production de la Power Plant.

### Systèmes Balistiques (weaponsTech) - Bonus attaque
```
multiplicateur_attaque = 1 + level × 10% (× 0.10)
```

### Champs Déflecteurs (shieldTech) - Bonus bouclier
```
multiplicateur_bouclier = 1 + level × 10% (× 0.10)
```

### Alliages Nano-Tressés (armorTech) - Bonus coque
```
multiplicateur_coque = 1 + level × 10% (× 0.10)
```

### Noeuds Subspatiaux (subspacialNodes) - Bonus cargo
```
multiplicateur_cargo = 1 + level × 5% (× 0.05)
```

### IA Stratégique (computerTech)
```
Nombre de flottes simultanées = 1 + computerTech level
```

### Automata Foundry (roboticsFactory) - Réduction temps construction
```
réduction = 1 / (1 + level × 0.1)
```
Exemple : Nv.5 = 1/1.5 = 33% plus rapide, Nv.10 = 1/2 = 50% plus rapide.

---

## BATIMENTS - COUTS DE BASE

| Bâtiment | Catégorie | Fer | Silice | Xenogas | Énergie | Facteur coût | Temps base | Facteur temps |
|---|---|---|---|---|---|---|---|---|
| Ferro Mine | resources | 60 | 15 | - | - | 1.5 | 30s | 1.8 |
| Silica Mine | resources | 48 | 24 | - | - | 1.6 | 40s | 1.8 |
| Xeno Well | resources | 225 | 75 | - | - | 1.5 | 60s | 1.8 |
| Power Plant | resources | 75 | 30 | - | - | 1.5 | 30s | 1.8 |
| Ferro Store | resources | 1 000 | - | - | - | 2 | 40s | 1.8 |
| Silica Store | resources | 1 000 | 500 | - | - | 2 | 40s | 1.8 |
| Xeno Store | resources | 1 000 | 1 000 | - | - | 2 | 50s | 1.8 |
| Automata Foundry | facilities | 400 | 120 | 200 | - | 2 | 120s | 2 |
| Orbital Assembly Dock | facilities | 400 | 200 | 100 | - | 2 | 120s | 2 |
| Arcology Research Lab | facilities | 200 | 400 | 200 | - | 2 | 150s | 2 |
| Quantum Reactor Core | facilities | 1 000 000 | 500 000 | 100 000 | - | 2 | 3 600s | 2 |
| Geoform Engine | facilities | 0 | 50 000 | 100 000 | 1 000 | 2 | 7 200s | 2 |

### Prérequis bâtiments

| Bâtiment | Prérequis |
|---|---|
| Ferro Mine | - |
| Silica Mine | - |
| Xeno Well | Ferro Mine Nv.1 |
| Power Plant | - |
| Ferro Store | - |
| Silica Store | - |
| Xeno Store | Xeno Well Nv.1 |
| Automata Foundry | - |
| Orbital Assembly Dock | Automata Foundry Nv.2 |
| Arcology Research Lab | - |
| Quantum Reactor Core | Automata Foundry Nv.10, IA Stratégique Nv.10 |
| Geoform Engine | Quantum Reactor Core Nv.1, Flux Quantique Nv.12 |

---

## RECHERCHES - COUTS DE BASE

| Recherche | Fer | Silice | Xenogas | Énergie | Facteur coût | Temps base | Facteur temps |
|---|---|---|---|---|---|---|---|
| Flux Quantique | - | 800 | 400 | - | 2 | 120s | 2 |
| Rayon à Particules | 200 | 100 | - | - | 2 | 90s | 2 |
| Flux Ionique | 1 000 | 300 | 100 | - | 2 | 150s | 2 |
| Surchauffe Plasmatique | 2 000 | 4 000 | 1 000 | - | 2 | 300s | 2 |
| Systèmes Balistiques | 800 | 200 | - | - | 2 | 150s | 2 |
| Champs Déflecteurs | 200 | 600 | - | - | 2 | 150s | 2 |
| Alliages Nano-Tressés | 1 000 | - | - | - | 2 | 120s | 2 |
| Propulsion Chimique | 400 | 600 | - | - | 2 | 180s | 2 |
| Réacteur à Impulsions | 2 000 | 4 000 | 600 | - | 2 | 300s | 2 |
| Voile Hyperspatial | 10 000 | 20 000 | 6 000 | - | 2 | 600s | 2 |
| IA Stratégique | - | 400 | 600 | - | 2 | 120s | 2 |
| Sonar Cosmique | 200 | 1 000 | 200 | - | 2 | 120s | 2 |
| Xéno-Cartographie | 4 000 | 8 000 | 4 000 | - | 1.75 | 600s | 2 |
| Noeuds Subspatiaux | - | 4 000 | 2 000 | - | 2 | 300s | 2 |
| Maillage Neuronal | 240 000 | 400 000 | 160 000 | - | 2 | 600s | 2 |
| Manipulation Gravitationnelle | - | - | - | 300 000 | 3 | 3 600s | 3 |

### Prérequis recherches

| Recherche | Prérequis |
|---|---|
| Flux Quantique | Arcology Research Lab Nv.1 |
| Rayon à Particules | Arcology Research Lab Nv.1 |
| Flux Ionique | Arcology Research Lab Nv.4, Rayon à Particules Nv.5, Flux Quantique Nv.4 |
| Surchauffe Plasmatique | Arcology Research Lab Nv.4, Rayon à Particules Nv.10, Flux Ionique Nv.5 |
| Systèmes Balistiques | Arcology Research Lab Nv.4 |
| Champs Déflecteurs | Arcology Research Lab Nv.6, Flux Quantique Nv.3 |
| Alliages Nano-Tressés | Arcology Research Lab Nv.2 |
| Propulsion Chimique | Arcology Research Lab Nv.1, Flux Quantique Nv.1 |
| Réacteur à Impulsions | Arcology Research Lab Nv.2, Flux Quantique Nv.1 |
| Voile Hyperspatial | Arcology Research Lab Nv.7, Flux Quantique Nv.5, Réacteur à Impulsions Nv.3 |
| IA Stratégique | Arcology Research Lab Nv.1 |
| Sonar Cosmique | Arcology Research Lab Nv.3 |
| Xéno-Cartographie | Arcology Research Lab Nv.3, Sonar Cosmique Nv.4, Réacteur à Impulsions Nv.3 |
| Noeuds Subspatiaux | Arcology Research Lab Nv.7, Flux Quantique Nv.5, Voile Hyperspatial Nv.3 |
| Maillage Neuronal | Arcology Research Lab Nv.10, IA Stratégique Nv.8, Voile Hyperspatial Nv.8 |
| Manipulation Gravitationnelle | Arcology Research Lab Nv.12 |

---

## VAISSEAUX

| Vaisseau | Fer | Silice | Xenogas | Temps | ATK | BOU | COQ | Vitesse | Cargo |
|---|---|---|---|---|---|---|---|---|---|
| Nova Scout | 3 000 | 1 000 | - | 30s | 50 | 10 | 400 | 12 500 | 50 |
| Fer de Lance | 6 000 | 4 000 | - | 60s | 150 | 25 | 1 000 | 10 000 | 100 |
| Cyclone | 20 000 | 7 000 | 2 000 | 120s | 400 | 50 | 2 700 | 15 000 | 800 |
| Bastion | 45 000 | 15 000 | - | 180s | 1 000 | 200 | 6 000 | 10 000 | 1 500 |
| Pyro | 50 000 | 25 000 | 15 000 | 240s | 1 000 | 500 | 7 500 | 4 000 | 500 |
| Nemesis | 30 000 | 40 000 | 15 000 | 180s | 700 | 400 | 7 000 | 10 000 | 750 |
| Fulgurant | 60 000 | 50 000 | 15 000 | 300s | 2 000 | 500 | 11 000 | 5 000 | 2 000 |
| Titan Astral | 5 000 000 | 4 000 000 | 1 000 000 | 3 600s | 200 000 | 50 000 | 900 000 | 100 | 1 000 000 |
| Atlas Cargo | 2 000 | 2 000 | - | 20s | 5 | 10 | 400 | 10 000 | 5 000 |
| Atlas Cargo XL | 6 000 | 6 000 | - | 40s | 5 | 25 | 1 200 | 7 500 | 25 000 |
| Barge Coloniale | 10 000 | 20 000 | 10 000 | 300s | 50 | 100 | 3 000 | 2 500 | 7 500 |
| Manta Recup | 10 000 | 6 000 | 2 000 | 60s | 1 | 10 | 1 600 | 2 000 | 20 000 |
| Spectre Sonde | - | 1 000 | - | 10s | 0 | 0 | 100 | 100 000 000 | 0 |
| Helios Remorqueur | - | 2 000 | 500 | 10s | 1 | 1 | 200 | 0 | 0 |

### Prérequis vaisseaux

| Vaisseau | Prérequis |
|---|---|
| Nova Scout | Orbital Assembly Dock Nv.1, Propulsion Chimique Nv.1 |
| Fer de Lance | Orbital Assembly Dock Nv.3, Alliages Nano-Tressés Nv.2, Réacteur à Impulsions Nv.2 |
| Cyclone | Orbital Assembly Dock Nv.5, Réacteur à Impulsions Nv.4, Flux Ionique Nv.2 |
| Bastion | Orbital Assembly Dock Nv.7, Voile Hyperspatial Nv.4 |
| Pyro | Orbital Assembly Dock Nv.8, Réacteur à Impulsions Nv.6, Surchauffe Plasmatique Nv.5 |
| Nemesis | Orbital Assembly Dock Nv.8, Voile Hyperspatial Nv.5, Rayon à Particules Nv.12 |
| Fulgurant | Orbital Assembly Dock Nv.9, Voile Hyperspatial Nv.6, Flux Ionique Nv.5 |
| Titan Astral | Orbital Assembly Dock Nv.12, Voile Hyperspatial Nv.7, Manipulation Gravitationnelle Nv.1 |
| Atlas Cargo | Orbital Assembly Dock Nv.2, Propulsion Chimique Nv.2 |
| Atlas Cargo XL | Orbital Assembly Dock Nv.4, Propulsion Chimique Nv.6 |
| Barge Coloniale | Orbital Assembly Dock Nv.4, Réacteur à Impulsions Nv.3, Xéno-Cartographie Nv.1 |
| Manta Recup | Orbital Assembly Dock Nv.4, Propulsion Chimique Nv.6, Champs Déflecteurs Nv.2 |
| Spectre Sonde | Orbital Assembly Dock Nv.3, Propulsion Chimique Nv.3, Sonar Cosmique Nv.2 |
| Helios Remorqueur | Orbital Assembly Dock Nv.1 |

**Helios Remorqueur** : produit **30 énergie** par unité (ne se déplace pas, vitesse = 0).

---

## DEFENSES

| Défense | Fer | Silice | Xenogas | Temps | ATK | BOU | COQ |
|---|---|---|---|---|---|---|---|
| Tourelle Cinétique | 2 000 | - | - | 15s | 80 | 20 | 200 |
| Canon à Impulsion | 1 500 | 500 | - | 20s | 100 | 25 | 250 |
| Canon de Faisceau | 6 000 | 2 000 | - | 30s | 250 | 100 | 800 |
| Canon de Masse | 20 000 | 15 000 | 2 000 | 60s | 1 100 | 200 | 3 500 |
| Projecteur Ionique | 5 000 | 3 000 | - | 30s | 150 | 500 | 800 |
| Canon Solaire | 50 000 | 50 000 | 30 000 | 120s | 3 000 | 300 | 10 000 |
| Petit Bouclier Planétaire | 10 000 | 10 000 | - | 120s | 1 | 2 000 | 2 000 |
| Grand Bouclier Planétaire | 50 000 | 50 000 | - | 300s | 1 | 10 000 | 10 000 |

### Prérequis défenses

| Défense | Prérequis |
|---|---|
| Tourelle Cinétique | Orbital Assembly Dock Nv.1 |
| Canon à Impulsion | Orbital Assembly Dock Nv.2, Flux Quantique Nv.2, Rayon à Particules Nv.3 |
| Canon de Faisceau | Orbital Assembly Dock Nv.4, Flux Quantique Nv.3, Rayon à Particules Nv.6 |
| Canon de Masse | Orbital Assembly Dock Nv.6, Systèmes Balistiques Nv.3, Flux Quantique Nv.6, Champs Déflecteurs Nv.1 |
| Projecteur Ionique | Orbital Assembly Dock Nv.4, Flux Ionique Nv.4 |
| Canon Solaire | Orbital Assembly Dock Nv.8, Surchauffe Plasmatique Nv.7 |
| Petit Bouclier Planétaire | Orbital Assembly Dock Nv.1, Champs Déflecteurs Nv.2 |
| Grand Bouclier Planétaire | Orbital Assembly Dock Nv.6, Champs Déflecteurs Nv.6 |

---

## STATS BOOSTEES (vaisseaux & défenses)

Les stats de combat sont multipliées par les recherches :
```
attaque_finale = attaque_base × (1 + weaponsTech × 0.10)
bouclier_final = bouclier_base × (1 + shieldTech × 0.10)
coque_finale   = coque_base × (1 + armorTech × 0.10)
cargo_final    = cargo_base × (1 + subspacialNodes × 0.05)
```

---

## EXEMPLES DE COUTS PAR NIVEAU

### Ferro Mine (facteur 1.5)
| Niveau | Fer | Silice |
|---|---|---|
| 0→1 | 60 | 15 |
| 1→2 | 90 | 22 |
| 2→3 | 135 | 33 |
| 3→4 | 202 | 50 |
| 4→5 | 303 | 75 |
| 5→6 | 455 | 113 |
| 10→11 | 3 454 | 863 |
| 15→16 | 26 214 | 6 553 |
| 20→21 | 199 120 | 49 780 |

### Arcology Research Lab (facteur 2)
| Niveau | Fer | Silice | Xenogas |
|---|---|---|---|
| 0→1 | 200 | 400 | 200 |
| 1→2 | 400 | 800 | 400 |
| 2→3 | 800 | 1 600 | 800 |
| 3→4 | 1 600 | 3 200 | 1 600 |
| 5→6 | 6 400 | 12 800 | 6 400 |
| 10→11 | 204 800 | 409 600 | 204 800 |
