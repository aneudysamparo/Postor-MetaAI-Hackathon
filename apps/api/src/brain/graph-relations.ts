// In-memory view over docs-graph.json: document -> project -> capability.
// Loaded once per process; the file is small (56 nodes / 80 edges).
import { readFileSync } from 'node:fs';

export interface GraphNode {
  id: string;
  type: string;
  label: string;
}

export interface GraphNeighbor {
  id: string;
  type: string;
  relation: string;
}

interface GraphFile {
  nodes?: unknown;
  edges?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class GraphRelations {
  private readonly nodesById = new Map<string, GraphNode>();
  private readonly outgoing = new Map<string, GraphNeighbor[]>();

  public constructor(graphPath: string) {
    const parsed = JSON.parse(readFileSync(graphPath, 'utf8')) as GraphFile;
    const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    for (const node of nodes) {
      if (isRecord(node) && typeof node.id === 'string') {
        this.nodesById.set(node.id, {
          id: node.id,
          type: typeof node.type === 'string' ? node.type : 'unknown',
          label: typeof node.label === 'string' ? node.label : node.id,
        });
      }
    }
    const edges = Array.isArray(parsed.edges) ? parsed.edges : [];
    for (const edge of edges) {
      if (!isRecord(edge) || typeof edge.from !== 'string' || typeof edge.to !== 'string') {
        continue;
      }
      const target = this.nodesById.get(edge.to);
      const list = this.outgoing.get(edge.from) ?? [];
      list.push({
        id: edge.to,
        type: target?.type ?? 'external',
        relation: typeof edge.relation === 'string' ? edge.relation : 'LINKED',
      });
      this.outgoing.set(edge.from, list);
    }
  }

  public relatedTo(documentId: string): GraphNeighbor[] {
    return this.outgoing.get(documentId) ?? [];
  }
}
