(function (scope) {
  'use strict';
  const height = n => n ? 1 + Math.max(height(n.left), height(n.right)) : 0;
  const balance = n => n ? height(n.left) - height(n.right) : 0;
  const copy = n => n ? {key:n.key, id:n.id, left:copy(n.left), right:copy(n.right)} : null;
  function rotate(n, dir) {
    const side = dir === 'right' ? 'left' : 'right';
    const other = side === 'left' ? 'right' : 'left';
    const top = n[side]; n[side] = top[other]; top[other] = n; return top;
  }
  function insert(n, key) {
    if (!n) return {key, id:key, left:null, right:null};
    if (key === n.key) return n;
    const side = key < n.key ? 'left' : 'right'; n[side] = insert(n[side], key);
    if (balance(n) > 1) {
      if (balance(n.left) < 0) n.left = rotate(n.left, 'left');
      return rotate(n, 'right');
    }
    if (balance(n) < -1) {
      if (balance(n.right) > 0) n.right = rotate(n.right, 'right');
      return rotate(n, 'left');
    }
    return n;
  }
  const build = values => values.reduce(insert, null);
  const presets = {
    ll:{label:'LL', values:[30,20,40,10], target:40},
    rr:{label:'RR', values:[20,10,30,40], target:10},
    lr:{label:'LR', values:[30,10,40,20], target:40},
    rl:{label:'RL', values:[20,10,40,30], target:10},
    zero:{label:'Child BF = 0', values:[30,20,40,10,25], target:40},
    leaf:{label:'Leaf', values:[30,20,40], target:20},
    one:{label:'One child', values:[30,20,40,10], target:20},
    two:{label:'Two children', values:[40,20,60,10,30,50,70,55], target:40}
  };
  function trace(tree, target) {
    const holder = {root:copy(tree)}, steps = [];
    function emit(label, text, focus=[], kind='normal') {
      steps.push({tree:copy(holder.root), label, text, focus, kind});
    }
    function turn(parent, side, dir) {
      const n = parent[side], promoted = n[dir === 'right' ? 'left' : 'right'];
      const transfer = promoted[dir === 'right' ? 'right' : 'left'];
      emit('Rotation plan', `Rotate ${dir} at ${n.key}: ${promoted.key} rises and ${n.key} moves ${dir === 'right' ? 'right' : 'left'}.${transfer ? ` The subtree rooted at ${transfer.key} transfers to ${n.key}'s ${dir === 'right' ? 'left' : 'right'} side to preserve BST order.` : ' The inner subtree is empty; no subtree needs to transfer.'}`, [n.id,promoted.id], 'plan');
      parent[side] = rotate(n, dir);
      emit('Rotate '+dir, `${promoted.key} now roots this subtree. Recompute heights and continue checking toward the root.`, [n.id,promoted.id], 'rotation');
    }
    function remove(parent, side, key) {
      const n = parent[side];
      if (!n) { emit('Not found', `${key} is not in the tree. No node is removed.`); return; }
      if (key !== n.key) {
        const next = key < n.key ? 'left' : 'right';
        emit('Search', `${key} ${next === 'left' ? '<' : '>'} ${n.key}: follow the ${next} child.`, [n.id]);
        remove(n, next, key);
      } else if (!n.left || !n.right) {
        const child = n.left || n.right;
        emit(child ? 'One child' : 'Leaf', child ? `Delete ${n.key}; its only child, ${child.key}, takes its place.` : `Delete ${n.key}, a leaf. Its parent link becomes empty.`, [n.id], 'delete');
        parent[side] = child;
        emit('Removed', `${n.key} has been removed.${child ? ` ${child.key} takes its place.` : ''} Now check the ancestors.`, child ? [child.id] : [], 'removed');
        return;
      } else {
        emit('Two children', `${n.key} has two children. Find its in-order successor: the smallest key in its right subtree.`, [n.id], 'delete');
        let successor = n.right;
        while (successor.left) {
          emit('Find successor', `At ${successor.key}, follow the left child to find the smallest key.`, [successor.id]);
          successor = successor.left;
        }
        emit('Successor', `${successor.key} is the successor. Copy its key into ${n.key}, then remove the original successor node.`, [n.id,successor.id], 'plan');
        n.key = successor.key;
        // The replacement and physical removal form one visible step, avoiding duplicate keys on screen.
        function unlink(p, s) {
          if (p[s].left) { unlink(p[s], 'left'); rebalance(p,s); }
          else { p[s] = p[s].right; emit('Successor removed', `Copied ${successor.key} into the target and removed the original successor.${successor.right ? ` Its right child, ${successor.right.key}, takes its place.` : ''}`, [n.id], 'removed'); }
        }
        unlink(n,'right');
      }
      rebalance(parent, side);
    }
    function rebalance(parent, side) {
      const n = parent[side]; if (!n) return;
      const b = balance(n), l = height(n.left), r = height(n.right);
      emit('Check balance', `At ${n.key}: left height ${l} − right height ${r} = BF ${b > 0 ? '+' : ''}${b}.${Math.abs(b) <= 1 ? ' Balanced; continue upward.' : ' Outside −1…+1; a rotation is needed.'}`, [n.id], Math.abs(b)>1 ? 'imbalance' : 'check');
      if (Math.abs(b) <= 1) return;
      const child = b > 1 ? n.left : n.right, cb = balance(child);
      const double = b > 1 ? cb < 0 : cb > 0;
      const type = b > 1 ? (double ? 'LR' : 'LL') : (double ? 'RL' : 'RR');
      emit(type+' case', `Heavy child ${child.key} has BF ${cb}.${cb === 0 ? ' In deletion, child BF = 0 still uses a single rotation.' : ''} ${double ? 'Use two rotations: first at the heavy child, then at the unbalanced node.' : `Use one ${b > 1 ? 'right' : 'left'} rotation at ${n.key}.`}`, [n.id,child.id], 'plan');
      if (double) turn(n, b > 1 ? 'left' : 'right', b > 1 ? 'left' : 'right');
      turn(parent, side, b > 1 ? 'right' : 'left');
    }
    emit('Before', `Delete ${target} from this AVL tree. First use BST deletion, then check balance back toward the root.`);
    remove(holder,'root',target);
    emit('Balanced', 'Deletion is complete. Every node has BF −1, 0, or +1, and BST ordering is preserved.', [], 'done');
    return steps;
  }
  const api = {height,balance,build,trace,presets};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else scope.AVLDelete = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
