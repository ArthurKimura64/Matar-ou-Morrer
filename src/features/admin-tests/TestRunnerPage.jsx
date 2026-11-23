import React, { useState, useEffect, useMemo, useCallback } from 'react';
import authService from '../../services/authService';
import { isTestEnvironment } from './testEnv';
import { buildTestSuites } from './testSuites';

const STATUS_BADGE = {
  idle: { className: 'bg-secondary', label: 'Aguardando' },
  running: { className: 'bg-info text-dark', label: 'Executando...' },
  passed: { className: 'bg-success', label: 'Passou' },
  failed: { className: 'bg-danger', label: 'Falhou' },
  skipped: { className: 'bg-warning text-dark', label: 'Pulado' }
};

const TestRunnerPage = ({ user, gameData, localization = {}, onBack }) => {
  const [authorized, setAuthorized] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState({});
  const [onlyFailures, setOnlyFailures] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);

  const testEnvActive = isTestEnvironment();

  // Segunda camada de proteção: confirma no servidor que a conta é Admin
  useEffect(() => {
    let isMounted = true;
    const verifyAccess = async () => {
      if (!testEnvActive || !user?.id) {
        if (isMounted) {
          setAuthorized(false);
          setCheckingAccess(false);
        }
        return;
      }

      const isAdmin = await authService.checkIsAdmin();
      if (isMounted) {
        setAuthorized(Boolean(isAdmin));
        setCheckingAccess(false);
      }
    };

    verifyAccess();
    return () => {
      isMounted = false;
    };
  }, [testEnvActive, user?.id]);

  const suites = useMemo(
    () => buildTestSuites({ gameData, localization, currentUser: user }),
    [gameData, localization, user]
  );

  const runSuites = useCallback(async (suitesToRun) => {
    setIsRunning(true);

    for (const suite of suitesToRun) {
      for (const test of suite.tests) {
        const key = `${suite.id}::${test.id}`;

        setResults((prev) => ({
          ...prev,
          [key]: { status: 'running', detail: '', durationMs: 0 }
        }));

        const start = performance.now();
        try {
          const detail = await test.run();
          const durationMs = Math.round(performance.now() - start);
          setResults((prev) => ({
            ...prev,
            [key]: { status: 'passed', detail: detail || 'OK', durationMs }
          }));
        } catch (err) {
          const durationMs = Math.round(performance.now() - start);
          const status = err?.isSkip ? 'skipped' : 'failed';
          setResults((prev) => ({
            ...prev,
            [key]: {
              status,
              detail: err?.message || String(err),
              durationMs
            }
          }));
        }
      }
    }

    setIsRunning(false);
  }, []);

  const handleRunAll = () => {
    setResults({});
    runSuites(suites);
  };

  const summary = useMemo(() => {
    const allTests = suites.flatMap((s) => s.tests.map((t) => `${s.id}::${t.id}`));
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    allTests.forEach((key) => {
      const st = results[key]?.status;
      if (st === 'passed') passed++;
      else if (st === 'failed') failed++;
      else if (st === 'skipped') skipped++;
    });

    return { total: allTests.length, passed, failed, skipped };
  }, [suites, results]);

  const handleCopyReport = () => {
    const lines = [
      `Relatório de Testes KOD — ${new Date().toLocaleString('pt-BR')}`,
      `Host: ${window.location.hostname}`,
      `Resumo: ${summary.passed}/${summary.total} passaram | ${summary.failed} falharam | ${summary.skipped} pulados`,
      ''
    ];

    suites.forEach((suite) => {
      lines.push(`=== ${suite.title} ===`);
      suite.tests.forEach((test) => {
        const r = results[`${suite.id}::${test.id}`];
        const status = r ? r.status.toUpperCase() : 'IDLE';
        const ms = r ? ` (${r.durationMs}ms)` : '';
        const detail = r?.detail ? ` -> ${r.detail}` : '';
        lines.push(`[${status}] ${test.name}${ms}${detail}`);
      });
      lines.push('');
    });

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2000);
    });
  };

  if (checkingAccess) {
    return (
      <section className="container py-5 text-center">
        <div className="spinner-border text-warning" role="status" />
        <p className="text-light mt-2">Verificando permissões de administrador...</p>
      </section>
    );
  }

  if (!authorized) {
    return (
      <section className="container py-5" aria-label="Acesso restrito">
        <div className="card bg-dark border-danger p-4 text-center mx-auto" style={{ maxWidth: '480px' }}>
          <h4 className="text-danger fw-bold mb-2">🔒 Acesso Restrito</h4>
          <p className="text-light small mb-3">
            O Laboratório de Testes só fica disponível para contas de Administrador em ambiente de teste.
          </p>
          <button type="button" className="btn btn-outline-light btn-sm" onClick={onBack}>
            ← Voltar ao Menu
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="container py-3" aria-label="Laboratório de Testes Automatizados">
      <header className="card bg-dark border-warning mb-3">
        <div className="card-body d-flex flex-row justify-content-between align-items-center flex-wrap gap-2">
          <div>
            <h4 className="text-warning fw-bold mb-1">🧪 Laboratório de Testes Automatizados</h4>
            <small className="text-muted">
              Ambiente: <strong>{window.location.hostname}</strong> • Acesso exclusivo Admin • Salas sandbox são apagadas automaticamente
            </small>
          </div>
          <button type="button" className="btn btn-outline-light btn-sm" onClick={onBack}>
            ← Voltar ao Menu
          </button>
        </div>
      </header>

      {/* Barra de Ações e Resumo */}
      <section className="card bg-dark border-secondary mb-3" aria-label="Controles de execução">
        <div className="card-body d-flex flex-row justify-content-between align-items-center flex-wrap gap-2">
          <div className="d-flex flex-wrap gap-2 align-items-center">
            <button
              type="button"
              className="btn btn-success"
              disabled={isRunning}
              onClick={handleRunAll}
            >
              {isRunning ? '⏳ Executando...' : '▶ Executar Todos os Testes'}
            </button>

            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              disabled={isRunning || Object.keys(results).length === 0}
              onClick={handleCopyReport}
            >
              {copiedReport ? '✅ Copiado!' : '📋 Copiar Relatório'}
            </button>

            <div className="form-check form-switch ms-2 mb-0">
              <input
                id="filter-only-failures"
                type="checkbox"
                className="form-check-input"
                checked={onlyFailures}
                onChange={(e) => setOnlyFailures(e.target.checked)}
              />
              <label htmlFor="filter-only-failures" className="form-check-label small text-light">
                Mostrar só falhas
              </label>
            </div>
          </div>

          <div className="d-flex gap-2 flex-wrap">
            <span className="badge bg-secondary">Total: {summary.total}</span>
            <span className="badge bg-success">✅ {summary.passed}</span>
            <span className="badge bg-danger">❌ {summary.failed}</span>
            {summary.skipped > 0 && (
              <span className="badge bg-warning text-dark">⏭️ {summary.skipped}</span>
            )}
          </div>
        </div>
      </section>

      {/* Nota sobre o rate limiter de criação de sala */}
      <div className="alert alert-info py-2 px-3 small mb-3">
        💡 <strong>Dica:</strong> A Suíte 5 cria e apaga uma sala real no Supabase. Por causa do limite anti-spam (5 segundos), aguarde 5s antes de rodar a Suíte 5 novamente em sequência.
      </div>

      {/* Lista de Suítes */}
      <div className="d-flex flex-column gap-3">
        {suites.map((suite) => {
          const visibleTests = onlyFailures
            ? suite.tests.filter((t) => results[`${suite.id}::${t.id}`]?.status === 'failed')
            : suite.tests;

          if (onlyFailures && visibleTests.length === 0) return null;

          return (
            <article key={suite.id} className="card bg-dark border-secondary">
              <header className="card-header d-flex flex-row justify-content-between align-items-center flex-wrap gap-2">
                <div>
                  <h6 className="text-white fw-bold mb-0">{suite.title}</h6>
                  <small className="text-muted">{suite.description}</small>
                </div>
                <button
                  type="button"
                  className="btn btn-outline-warning btn-sm"
                  disabled={isRunning}
                  onClick={() => runSuites([suite])}
                >
                  ▶ Rodar suíte
                </button>
              </header>

              <div className="card-body p-2">
                <div className="d-flex flex-column gap-2">
                  {visibleTests.map((test) => {
                    const res = results[`${suite.id}::${test.id}`] || { status: 'idle', detail: '', durationMs: 0 };
                    const badge = STATUS_BADGE[res.status] || STATUS_BADGE.idle;

                    return (
                      <div
                        key={test.id}
                        className="p-2 rounded border border-secondary d-flex flex-column gap-1"
                        style={{ backgroundColor: 'var(--kod-bg-card-inner)' }}
                      >
                        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                          <span className="text-light fw-bold small">{test.name}</span>
                          <div className="d-flex align-items-center gap-2">
                            {res.durationMs > 0 && (
                              <small className="text-muted">{res.durationMs}ms</small>
                            )}
                            <span className={`badge ${badge.className}`}>{badge.label}</span>
                          </div>
                        </div>

                        {res.detail && (
                          <small
                            className={
                              res.status === 'failed'
                                ? 'text-danger'
                                : res.status === 'skipped'
                                ? 'text-warning'
                                : 'text-muted'
                            }
                          >
                            {res.detail}
                          </small>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default TestRunnerPage;