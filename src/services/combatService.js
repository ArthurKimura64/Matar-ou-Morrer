import { supabase } from '../config/supabaseClient';

/**
 * ============================================================================
 * SERVIÇO DE COMBATE (combatService.js)
 * ============================================================================
 * Centraliza todas as leituras, gravações e RPCs da tabela
 * `combat_notifications`, mantendo o padrão:
 * Tela -> Hook (useCombatSync) -> Service (CombatService) -> Supabase.
 * ============================================================================
 */
export class CombatService {
  static async getActiveCombats(roomId) {
    const { data, error } = await supabase
      .from('combat_notifications')
      .select('*')
      .eq('room_id', roomId)
      .in('status', ['pending', 'in_progress'])
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });

    if (error) return { success: false, data: [], error: error.message };
    return { success: true, data: data || [] };
  }

  static async startCombat({
    roomId,
    attackerId,
    defenderIds,
    attackData,
    allowCounterAttack = true,
    allowOpportunityAttacks = true
  }) {
    const { data, error } = await supabase.rpc('start_combat', {
      p_room_id: roomId,
      p_attacker_id: attackerId,
      p_defender_ids: defenderIds,
      p_attack_data: attackData,
      p_allow_counter_attack: allowCounterAttack,
      p_allow_opportunity_attacks: allowOpportunityAttacks
    });

    if (error || (data && data.success === false)) {
      return {
        success: false,
        error: data?.error || error?.message || 'Erro ao iniciar combate'
      };
    }
    return { success: true, data };
  }

  static async updateCombat(combatId, fields) {
    const { error } = await supabase
      .from('combat_notifications')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', combatId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  static async updateCombatGroup(groupId, fields) {
    const { error } = await supabase
      .from('combat_notifications')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('combat_group_id', groupId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  static async updateCombatRoll({ combatId, roundIndex, isAttacker, roll, total, allowAdjust = false }) {
    const { data, error } = await supabase.rpc('update_combat_roll', {
      p_combat_id: combatId,
      p_round_index: roundIndex,
      p_is_attacker: isAttacker,
      p_roll: roll,
      p_total: total,
      p_allow_adjust: allowAdjust
    });

    if (error || (data && data.success === false)) {
      return {
        success: false,
        error: data?.error || error?.message || 'Erro ao registrar rolagem'
      };
    }
    return { success: true, data };
  }

  static async updateCombatGroupSharedRoll({ combatGroupId, roll, total, allowAdjust = false }) {
    const { data, error } = await supabase.rpc('update_combat_group_shared_roll', {
      p_combat_group_id: combatGroupId,
      p_roll: roll,
      p_total: total,
      p_allow_adjust: allowAdjust
    });

    if (error || (data && data.success === false)) {
      return {
        success: false,
        error: data?.error || error?.message || 'Erro ao registrar rolagem compartilhada'
      };
    }
    return { success: true, data };
  }

  static async confirmDefenseWeapon({ combatId, defenderWeapon, roundData, totalRounds }) {
    const { data, error } = await supabase.rpc('confirm_defense_weapon', {
      p_combat_id: combatId,
      p_defender_weapon: defenderWeapon,
      p_round_data: roundData,
      p_total_rounds: totalRounds
    });

    if (error || (data && data.success === false)) {
      return {
        success: false,
        error: data?.error || error?.message || 'Erro ao confirmar arma de defesa'
      };
    }
    return { success: true, data };
  }

  static async updateCombatGroupPhase(combatGroupId, action) {
    const { data, error } = await supabase.rpc('update_combat_group_phase', {
      p_combat_group_id: combatGroupId,
      p_action: action
    });

    if (error || (data && data.success === false)) {
      return {
        success: false,
        error: data?.error || error?.message || 'Erro ao atualizar fase do combate'
      };
    }
    return { success: true, data };
  }

  static async addOpportunityAttack({ combatId, playerId, playerName, weapon, target }) {
    const { data, error } = await supabase.rpc('add_opportunity_attack', {
      p_combat_id: combatId,
      p_player_id: playerId,
      p_player_name: playerName,
      p_weapon: weapon,
      p_target: target
    });

    if (error || (data && data.success === false)) {
      return {
        success: false,
        error: data?.error || error?.message || 'Não foi possível adicionar ataque de oportunidade'
      };
    }
    return { success: true, data };
  }

  static async cancelCombat({ combatId, combatGroupId = null }) {
    if (combatGroupId) {
      return this.updateCombatGroupPhase(combatGroupId, 'cancel_all');
    }
    return this.updateCombat(combatId, { status: 'cancelled' });
  }

  static async cancelPlayerCombats(playerId) {
    if (!playerId) return { success: true };
    const { error } = await supabase
      .from('combat_notifications')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .or(`attacker_id.eq.${playerId},defender_id.eq.${playerId}`)
      .in('status', ['pending', 'in_progress']);

    if (error) return { success: false, error: error.message };
    return { success: true };
  }
}