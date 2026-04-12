import React, { useMemo, useCallback, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, Platform } from 'react-native';
import { X, ChevronRight, CheckCircle, XCircle, GitBranch, ExternalLink } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { BUILDINGS, RESEARCH } from '@/constants/gameData';
import { Prerequisite } from '@/types/game';

interface PrereqTreeProps {
  visible: boolean;
  onClose: () => void;
  itemId: string;
  itemType: 'building' | 'research' | 'ship' | 'defense';
  buildings: Record<string, number>;
  research: Record<string, number>;
  onNavigateToItem?: (id: string, type: 'building' | 'research') => void;
}

interface TreeNode {
  id: string;
  type: 'building' | 'research';
  name: string;
  requiredLevel: number;
  currentLevel: number;
  isMet: boolean;
  children: TreeNode[];
}

function getItemName(id: string): string {
  const b = BUILDINGS.find(x => x.id === id);
  if (b) return b.name;
  const r = RESEARCH.find(x => x.id === id);
  if (r) return r.name;
  return id;
}

function getPrerequisites(id: string, type: 'building' | 'research'): Prerequisite[] {
  if (type === 'building') {
    const b = BUILDINGS.find(x => x.id === id);
    return b?.prerequisites ?? [];
  }
  const r = RESEARCH.find(x => x.id === id);
  return r?.prerequisites ?? [];
}

function getItemPrereqs(itemId: string, itemType: string): Prerequisite[] {
  if (itemType === 'building') {
    const b = BUILDINGS.find(x => x.id === itemId);
    return b?.prerequisites ?? [];
  }
  if (itemType === 'research') {
    const r = RESEARCH.find(x => x.id === itemId);
    return r?.prerequisites ?? [];
  }
  if (itemType === 'ship') {
    const { SHIPS } = require('@/constants/gameData');
    const s = SHIPS.find((x: any) => x.id === itemId);
    return s?.prerequisites ?? [];
  }
  if (itemType === 'defense') {
    const { DEFENSES } = require('@/constants/gameData');
    const d = DEFENSES.find((x: any) => x.id === itemId);
    return d?.prerequisites ?? [];
  }
  return [];
}

function buildTree(prereq: Prerequisite, buildings: Record<string, number>, research: Record<string, number>, visited: Set<string> = new Set()): TreeNode {
  const key = `${prereq.type}:${prereq.id}:${prereq.level}`;
  const currentLevel = prereq.type === 'building' ? (buildings[prereq.id] ?? 0) : (research[prereq.id] ?? 0);
  const isMet = currentLevel >= prereq.level;

  const node: TreeNode = {
    id: prereq.id,
    type: prereq.type,
    name: getItemName(prereq.id),
    requiredLevel: prereq.level,
    currentLevel,
    isMet,
    children: [],
  };

  if (!isMet && !visited.has(key)) {
    visited.add(key);
    const subPrereqs = getPrerequisites(prereq.id, prereq.type);
    for (const sub of subPrereqs) {
      const subCurrentLevel = sub.type === 'building' ? (buildings[sub.id] ?? 0) : (research[sub.id] ?? 0);
      if (subCurrentLevel < sub.level) {
        node.children.push(buildTree(sub, buildings, research, visited));
      }
    }
  }

  return node;
}

function TreeNodeView({ node, depth, onNodePress, onNavigate }: { node: TreeNode; depth: number; onNodePress: (node: TreeNode) => void; onNavigate?: (node: TreeNode) => void }) {
  return (
    <View style={{ marginLeft: depth * 16 }}>
      <Pressable
        style={[treeStyles.nodeRow, node.isMet ? treeStyles.nodeRowMet : treeStyles.nodeRowMissing]}
        onPress={() => onNodePress(node)}
      >
        <View style={treeStyles.nodeLeft}>
          {depth > 0 && (
            <View style={treeStyles.connector}>
              <View style={treeStyles.connectorLine} />
              <ChevronRight size={10} color={Colors.textMuted} />
            </View>
          )}
          {node.isMet ? (
            <CheckCircle size={14} color={Colors.success} />
          ) : (
            <XCircle size={14} color={Colors.danger} />
          )}
          <Text style={[treeStyles.nodeName, { color: node.isMet ? Colors.success : Colors.text }]}>
            {node.name}
          </Text>
        </View>
        <View style={treeStyles.nodeRightActions}>
          <View style={[treeStyles.levelBadge, { backgroundColor: node.isMet ? Colors.success + '20' : Colors.danger + '20' }]}>
            <Text style={[treeStyles.levelText, { color: node.isMet ? Colors.success : Colors.danger }]}>
              {node.currentLevel}/{node.requiredLevel}
            </Text>
          </View>
          {!node.isMet && onNavigate && (
            <Pressable
              style={treeStyles.goToBtn}
              onPress={() => onNavigate(node)}
              hitSlop={6}
            >
              <ExternalLink size={12} color={Colors.primary} />
            </Pressable>
          )}
        </View>
      </Pressable>
      {node.children.map((child, i) => (
        <TreeNodeView key={`${child.id}-${i}`} node={child} depth={depth + 1} onNodePress={onNodePress} onNavigate={onNavigate} />
      ))}
    </View>
  );
}

export default function PrereqTree({ visible, onClose, itemId, itemType, buildings, research, onNavigateToItem }: PrereqTreeProps) {
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const router = useRouter();

  const handleNavigateToNode = useCallback((node: TreeNode) => {
    if (onNavigateToItem) {
      onClose();
      onNavigateToItem(node.id, node.type);
      return;
    }
    onClose();
    const ts = Date.now().toString();
    if (node.type === 'building') {
      router.navigate({ pathname: '/(tabs)/buildings', params: { scrollTo: node.id, _t: ts } });
    } else {
      router.navigate({ pathname: '/(tabs)/research', params: { scrollTo: node.id, _t: ts } });
    }
  }, [onClose, onNavigateToItem, router]);

  const prereqs = useMemo(() => getItemPrereqs(itemId, itemType), [itemId, itemType]);

  const tree = useMemo(() => {
    return prereqs.map(prereq => buildTree(prereq, buildings, research));
  }, [prereqs, buildings, research]);

  const itemName = useMemo(() => {
    if (itemType === 'building') return BUILDINGS.find(b => b.id === itemId)?.name ?? itemId;
    if (itemType === 'research') return RESEARCH.find(r => r.id === itemId)?.name ?? itemId;
    const { SHIPS, DEFENSES } = require('@/constants/gameData');
    if (itemType === 'ship') return SHIPS.find((s: any) => s.id === itemId)?.name ?? itemId;
    if (itemType === 'defense') return DEFENSES.find((d: any) => d.id === itemId)?.name ?? itemId;
    return itemId;
  }, [itemId, itemType]);

  const handleNodePress = useCallback((node: TreeNode) => {
    if (!node.isMet) {
      setSelectedNode(node);
    }
  }, []);

  const selectedSubTree = useMemo(() => {
    if (!selectedNode) return null;
    const prereq: Prerequisite = { type: selectedNode.type, id: selectedNode.id, level: selectedNode.requiredLevel };
    return buildTree(prereq, buildings, research);
  }, [selectedNode, buildings, research]);

  if (!visible) return null;

  const allMet = tree.every(n => n.isMet);

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <View style={treeStyles.overlay}>
        <View style={treeStyles.container}>
          <View style={treeStyles.header}>
            <View style={treeStyles.headerLeft}>
              <GitBranch size={18} color={Colors.primary} />
              <Text style={treeStyles.headerTitle}>Arbre des prérequis</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <X size={22} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <View style={treeStyles.targetItem}>
            <Text style={treeStyles.targetLabel}>Pour débloquer :</Text>
            <Text style={treeStyles.targetName}>{itemName}</Text>
          </View>

          {allMet ? (
            <View style={treeStyles.allMetBanner}>
              <CheckCircle size={16} color={Colors.success} />
              <Text style={treeStyles.allMetText}>Tous les prérequis sont remplis !</Text>
            </View>
          ) : null}

          <ScrollView style={treeStyles.scroll} showsVerticalScrollIndicator={false}>
            {tree.map((node, i) => (
              <TreeNodeView key={`${node.id}-${i}`} node={node} depth={0} onNodePress={handleNodePress} onNavigate={handleNavigateToNode} />
            ))}

            {selectedNode && selectedSubTree && selectedSubTree.children.length > 0 && (
              <View style={treeStyles.subTreeSection}>
                <View style={treeStyles.subTreeHeader}>
                  <GitBranch size={14} color={Colors.xenogas} />
                  <Text style={treeStyles.subTreeTitle}>Sous-arbre : {selectedNode.name}</Text>
                  <Pressable onPress={() => setSelectedNode(null)} hitSlop={8}>
                    <X size={16} color={Colors.textMuted} />
                  </Pressable>
                </View>
                {selectedSubTree.children.map((child, i) => (
                  <TreeNodeView key={`sub-${child.id}-${i}`} node={child} depth={0} onNodePress={handleNodePress} onNavigate={handleNavigateToNode} />
                ))}
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const treeStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '75%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  targetItem: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  targetLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  targetName: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.primary,
    marginTop: 2,
  },
  allMetBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: Colors.success + '15',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.success + '30',
  },
  allMetText: {
    fontSize: 13,
    color: Colors.success,
    fontWeight: '700' as const,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
    borderWidth: 1,
  },
  nodeRowMet: {
    backgroundColor: Colors.success + '08',
    borderColor: Colors.success + '20',
  },
  nodeRowMissing: {
    backgroundColor: Colors.danger + '08',
    borderColor: Colors.danger + '20',
  },
  nodeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  connector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 2,
  },
  connectorLine: {
    width: 8,
    height: 1,
    backgroundColor: Colors.textMuted,
  },
  nodeName: {
    fontSize: 13,
    fontWeight: '600' as const,
    flexShrink: 1,
  },
  levelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  levelText: {
    fontSize: 11,
    fontWeight: '700' as const,
  },
  subTreeSection: {
    marginTop: 16,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.xenogas + '30',
  },
  subTreeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  subTreeTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.xenogas,
  },
  nodeRightActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  goToBtn: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: Colors.primary + '15',
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});
