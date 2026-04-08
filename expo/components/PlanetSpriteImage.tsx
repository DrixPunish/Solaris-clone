import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

interface PlanetSpriteImageProps {
  spriteUrl: string;
  size: number;
}

export default React.memo(function PlanetSpriteImage({ spriteUrl, size }: PlanetSpriteImageProps) {
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Image
        source={{ uri: spriteUrl }}
        style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
        resizeMode="cover"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    backgroundColor: 'transparent',
  },
});
