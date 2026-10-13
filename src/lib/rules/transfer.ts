import { z } from 'zod';
import { CLASSES, RACES, PRIMARY_STAT_NAMES, SECONDARY_SKILLS, uid, type Character } from './index';
import { normalizeCharacter } from '../storage';
import { normalizeInventory, SLOTS, type Item } from './inventory';
import { EFFECT_KIND_LABELS, RANKS, SLOT_KIND_LABELS as unused } from './items';
