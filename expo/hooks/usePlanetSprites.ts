import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/utils/supabase';

interface PlanetSprite {
  galaxy: number;
  system: number;
  position: number;
  sprite_url: string;
}

export function usePlanetSpritesForSystem(galaxy: number, system: number) {
  return useQuery({
    queryKey: ['planet_sprites', galaxy, system],
    queryFn: async () => {
      console.log('[PlanetSprites] Fetching sprites for system', galaxy, system);
      const { data, error } = await supabase
        .from('planet_sprites')
        .select('galaxy, system, position, sprite_url')
        .eq('galaxy', galaxy)
        .eq('system', system);

      if (error) {
        console.log('[PlanetSprites] Error fetching sprites:', error.message);
        return new Map<number, string>();
      }

      const map = new Map<number, string>();
      for (const sprite of (data ?? []) as PlanetSprite[]) {
        map.set(sprite.position, sprite.sprite_url);
      }
      console.log('[PlanetSprites] Found', map.size, 'sprites in system', galaxy, system);
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function usePlanetSprite(coords: [number, number, number]) {
  return useQuery({
    queryKey: ['planet_sprite', coords[0], coords[1], coords[2]],
    queryFn: async () => {
      console.log('[PlanetSprites] Fetching sprite for coords', coords);
      const { data, error } = await supabase
        .from('planet_sprites')
        .select('sprite_url')
        .eq('galaxy', coords[0])
        .eq('system', coords[1])
        .eq('position', coords[2])
        .maybeSingle();

      if (error) {
        console.log('[PlanetSprites] Error:', error.message);
        return null;
      }
      return (data?.sprite_url as string) ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });
}
