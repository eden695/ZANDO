import React, {useEffect, useRef, useState} from 'react';
import {
  ArrowRight,
  Lightbulb,
  MessageSquareText,
  Send,
  Trash2,
} from 'lucide-react';
import {useStore} from '../context/StoreContext';
import {
  ASSISTANT_SUGGESTION_GROUPS,
  SuggestionGroup,
} from '../services/localAssistantService';
import {formatDateTime} from '../utils/format';

interface AssistantModuleProps {
  onNavigate: (route: string) => void;
}

export const AssistantModule: React.FC<AssistantModuleProps> = ({onNavigate}) => {
  const {
    assistantMessages,
    products,
    customers,
    askAssistant,
    clearAssistantHistory,
    notify,
  } = useStore();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [activeGroup, setActiveGroup] = useState<SuggestionGroup['id']>('finances');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({behavior: 'smooth'});
  }, [assistantMessages.length]);

  const submitQuestion = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setInput('');
    try {
      await askAssistant(trimmed);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erreur de l’assistant local.', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitQuestion(input);
  };

  const currentGroup =
    ASSISTANT_SUGGESTION_GROUPS.find((g) => g.id === activeGroup) ??
    ASSISTANT_SUGGESTION_GROUPS[0];

  const dynamicQuickPrompts = [
    ...currentGroup.items,
    ...(activeGroup === 'stock' && products[0]
      ? [`Analyse complète du produit ${products[0].name}`]
      : []),
    ...(activeGroup === 'clients' && customers[0]
      ? [`Quelle est la situation de ${customers[0].name} ?`]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      {/* Header Explanation */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <MessageSquareText className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            <strong>Analyste commercial hors ligne</strong> — Interrogez votre boutique en français (bilan, comparaisons, rentabilité par produit/catégorie/client, réapprovisionnement, simulations de remise ou d’objectif). Zéro Internet requis, zéro chiffre inventé.
          </div>
        </div>
        {assistantMessages.length > 0 && (
          <button
            type="button"
            onClick={async () => {
              await clearAssistantHistory();
              notify('Historique de conversation effacé.', 'info');
            }}
            className="inline-flex items-center gap-1.5 min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Effacer</span>
          </button>
        )}
      </section>

      {/* Categorized Suggestions */}
      <section className="space-y-2.5">
        <div className="flex flex-wrap gap-1.5">
          {ASSISTANT_SUGGESTION_GROUPS.map((grp) => {
            const active = grp.id === activeGroup;
            return (
              <button
                key={grp.id}
                type="button"
                onClick={() => setActiveGroup(grp.id)}
                className={`min-h-[36px] px-3 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'text-white'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
                style={
                  active
                    ? {
                        backgroundColor: 'var(--brand-primary, #0F172A)',
                        color: 'var(--brand-primary-fg, #FFFFFF)',
                      }
                    : undefined
                }
              >
                {grp.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          {dynamicQuickPrompts.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => submitQuestion(s)}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-500 text-xs font-medium text-slate-700 dark:text-slate-200 text-left transition-colors cursor-pointer"
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      {/* Conversation History */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4 min-h-[300px] max-h-[55vh] overflow-y-auto">
        {assistantMessages.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Posez n’importe quelle question sur votre activité ou mentionnez directement un produit ou un client.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Exemples : « Fais-moi un bilan complet », « Compare cette semaine à la semaine dernière », « Si je fais une remise de 10% ? ».
            </p>
          </div>
        ) : (
          assistantMessages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.role === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              <div
                className={`max-w-[94%] sm:max-w-[85%] rounded-2xl px-4 py-3 text-sm space-y-2.5 ${
                  msg.role === 'user'
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                    : 'bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white'
                }`}
              >
                <p className="leading-relaxed">{msg.text}</p>

                {msg.metrics && msg.metrics.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 tabular-nums">
                    {msg.metrics.map((m, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2"
                      >
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {m.label}
                        </div>
                        <div className="text-sm font-bold text-slate-900 dark:text-white">
                          {m.value}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {msg.details && msg.details.length > 0 && (
                  <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300 border-t border-slate-200 dark:border-slate-700 pt-2 tabular-nums">
                    {msg.details.map((line, idx) => (
                      <li key={idx}>{line}</li>
                    ))}
                  </ul>
                )}

                {msg.recommendations && msg.recommendations.length > 0 && (
                  <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 px-3 py-2 space-y-1">
                    <div className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                      <Lightbulb className="w-3.5 h-3.5" />
                      <span>Recommandation pratique</span>
                    </div>
                    {msg.recommendations.map((rec, idx) => (
                      <p key={idx} className="text-xs text-emerald-900 dark:text-emerald-200">
                        {rec}
                      </p>
                    ))}
                  </div>
                )}

                {msg.followUps && msg.followUps.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {msg.followUps.map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => submitQuestion(f)}
                        className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:border-emerald-500 cursor-pointer"
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                )}

                {msg.actionRoute && msg.actionLabel && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => onNavigate(msg.actionRoute!)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                    >
                      <span>{msg.actionLabel}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
              <span className="mt-1 px-1 text-[10px] text-slate-400 tabular-nums">
                {formatDateTime(msg.createdAt)}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </section>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ex. : Bilan global, Stock de [produit], Dette de [client], Remise 15%..."
          className="flex-1 min-h-[48px] px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="inline-flex items-center justify-center gap-2 min-h-[48px] px-5 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-50 shrink-0"
          style={{
            backgroundColor: 'var(--brand-accent, #059669)',
            color: 'var(--brand-accent-fg, #FFFFFF)',
          }}
        >
          <Send className="w-4 h-4" />
          <span className="hidden sm:inline">Analyser</span>
        </button>
      </form>
    </div>
  );
};
