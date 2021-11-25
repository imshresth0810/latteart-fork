/**
 * Copyright 2021 NTT Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ActionTree } from "vuex";
import { OperationHistoryState } from ".";
import { RootState } from "..";
import Settings from "@/lib/common/settings/Settings";
import { NoteEditInfo } from "@/lib/captureControl/types";
import {
  WindowHandle,
  Edge,
  ScreenTransition,
  OperationWithNotes,
  ElementInfo,
} from "@/lib/operationHistory/types";
import { Operation } from "@/lib/operationHistory/Operation";
import SequenceDiagramGraphConverter, {
  SequenceDiagramGraphCallback,
} from "@/lib/operationHistory/graphConverter/SequenceDiagramGraphConverter";
import ScreenHistory from "@/lib/operationHistory/ScreenHistory";
import * as Coverage from "@/lib/operationHistory/Coverage";
import ScreenTransitionDiagramGraphConverter, {
  FlowChartGraphCallback,
} from "@/lib/operationHistory/graphConverter/ScreenTransitionDiagramGraphConverter";
import MermaidGraphConverter from "@/lib/operationHistory/graphConverter/MermaidGraphConverter";
import InputValueTable from "@/lib/operationHistory/InputValueTable";
import { CapturedOperation } from "@/lib/operationHistory/CapturedOperation";
import { collectKeyword } from "@/lib/common/util";
import { ResumeAction } from "@/lib/operationHistory/actions/ResumeAction";
import { RecordIntentionAction } from "@/lib/operationHistory/actions/RecordIntentionAction";
import { SaveIntentionAction } from "@/lib/operationHistory/actions/SaveIntentionAction";
import { MoveIntentionAction } from "@/lib/operationHistory/actions/MoveIntentionAction";
import { TestScriptGeneratorImpl } from "@/lib/operationHistory/scriptGenerator/TestScriptGenerator";
import { GenerateTestScriptsAction } from "@/lib/operationHistory/actions/GenerateTestScriptsAction";

const actions: ActionTree<OperationHistoryState, RootState> = {
  /**
   * Set settings to the State.
   * @param context Action context.
   * @param payload.settings Settings.
   */
  async setSettings(context, payload: { settings: Settings }) {
    const config = payload.settings.config;
    if (!config) {
      return;
    }
    context.commit("setDefaultTagList", {
      defaultTagList: payload.settings.defaultTagList,
    });
    context.commit("setImageCompression", {
      imageCompression: config.imageCompression,
    });
    context.commit("setCoverage", { coverage: config.coverage });
    context.commit("setDisplayInclusionList", { displayInclusionList: [] });
    context.commit("setScreenDefinition", {
      screenDefinition: config.screenDefinition,
    });
  },

  /**
   * Save settings in the repository.
   * @param context Action context.
   * @param payload.config Settings.
   */
  async writeSettings(
    context,
    payload: { config: OperationHistoryState["config"] }
  ) {
    const settings = {
      captureSettings:
        context.rootState.settingsProvider.settings.captureSettings,
      config: {
        screenDefinition: payload.config.screenDefinition,
        coverage: payload.config.coverage,
        imageCompression: payload.config.imageCompression,
      },
      debug: context.rootState.settingsProvider.settings.debug,
      defaultTagList:
        context.rootState.settingsProvider.settings.defaultTagList,
      locale: context.rootState.settingsProvider.settings.locale,
      mode: context.rootState.settingsProvider.settings.mode,
      viewPointsPreset:
        context.rootState.settingsProvider.settings.viewPointsPreset,
    };
    const reply = await context.rootState.repositoryServiceDispatcher.saveSettings(
      settings
    );
    if (reply === null) {
      return;
    }
    if (!reply.succeeded) {
      const errorMessage = context.rootGetters.message(
        `error.common.${reply.error!.code}`
      );
      throw new Error(errorMessage);
    }
  },

  /**
   * Load settings from the repository and update the State.
   * If the settings are passed as an argument, use it.
   * @param context Action context.
   * @param payload.settings Settings.
   */
  async readSettings(context, payload: { settings?: Settings }) {
    if (payload.settings) {
      // In viewer mode
      context.commit(
        "setSettings",
        { settings: payload.settings },
        { root: true }
      );
      context.dispatch("setSettings", { settings: payload.settings });
      return;
    }

    const reply = await context.rootState.repositoryServiceDispatcher.getSettings();
    if (reply.succeeded) {
      context.commit("setSettings", { settings: reply.data }, { root: true });
      context.dispatch("setSettings", { settings: reply.data });
    } else {
      const errorMessage = context.rootGetters.message(
        `error.common.${reply.error!.code}`
      );
      throw new Error(errorMessage);
    }
  },

  /**
   * Record a test intention.
   * @param context Action context.
   * @param payload.noteEditInfo Test intention information.
   */
  async saveIntention(context, payload: { noteEditInfo: NoteEditInfo }) {
    const recordIntentionAction = new RecordIntentionAction(
      {
        setIntention: (intention) => {
          context.commit("setIntention", { intention });
          context.commit("setCanUpdateModels", { canUpdateModels: true });
        },
      },
      context.rootState.repositoryServiceDispatcher
    );

    const moveIntentionAction = new MoveIntentionAction(
      {
        moveIntention: (oldSequence, newIntention) => {
          context.commit("deleteIntention", { sequence: oldSequence });
          context.commit("setIntention", { intention: newIntention });
          context.commit("setCanUpdateModels", { canUpdateModels: true });
        },
      },
      context.rootState.repositoryServiceDispatcher
    );

    new SaveIntentionAction({
      recordIntention: async (note) => {
        await recordIntentionAction.record(context.state.history, note);
      },
      moveIntention: async (fromSequence, destSequence) => {
        await moveIntentionAction.move(
          context.state.testResultInfo.id,
          fromSequence,
          destSequence
        );
      },
    }).save(
      context.state.testResultInfo.id,
      payload.noteEditInfo,
      context.state.history
    );
  },

  /**
   * Delete a test intention.
   * @param context Action context.
   * @param payload.sequence Sequence number of the test intention.
   */
  async deleteIntention(context, payload: { sequence: number }) {
    const deletedIntentionSequence = (
      await context.rootState.repositoryServiceDispatcher.deleteIntention(
        context.state.testResultInfo.id,
        payload.sequence
      )
    ).data!;

    context.commit("deleteIntention", { sequence: deletedIntentionSequence });
    context.commit("setCanUpdateModels", { canUpdateModels: true });
  },

  /**
   * Record a bug.
   * @param context Action context.
   * @param payload.noteEditInfo Bug information.
   */
  async saveBug(context, payload: { noteEditInfo: NoteEditInfo }) {
    const {
      oldSequence,
      oldIndex,
      newSequence,
      note,
      noteDetails,
      shouldTakeScreenshot,
    } = payload.noteEditInfo;

    await context.dispatch("recordBug", {
      summary: note,
      details: noteDetails,
      sequence:
        oldSequence !== null
          ? oldSequence
          : (() => {
              const lastIndex = context.state.history.length - 1;
              return context.state.history[lastIndex]?.operation.sequence ?? 1;
            })(),
      index: oldIndex !== null ? oldIndex : undefined,
      shouldTakeScreenshot,
    });

    if (oldSequence !== null && oldIndex !== null && newSequence !== null) {
      await context.dispatch("moveBug", {
        from: {
          sequence: oldSequence,
          index: oldIndex,
        },
        dest: {
          sequence: newSequence,
        },
      });
    }
  },

  /**
   * Save a bug in the repository.
   * @param context Action context.
   * @param payload.summary Summary of the bug.
   * @param payload.details Details of the bug.
   * @param payload.sequence Sequence number of the bug.
   * @param payload.index Index for bugs related to the same operation.
   * @param payload.shouldTakeScreenshot Whether to take a screenshot or not.
   */
  async recordBug(
    context,
    payload: {
      summary: string;
      details: string;
      sequence: number;
      index?: number;
      shouldTakeScreenshot: boolean;
    }
  ) {
    // Take a screenshot.
    const imageData: string | undefined = payload.shouldTakeScreenshot
      ? await context.dispatch("captureControl/takeScreenshot", null, {
          root: true,
        })
      : undefined;

    const recordedNote = await (async () => {
      // update
      if (payload.index !== undefined) {
        return (
          await context.rootState.repositoryServiceDispatcher.editBug(
            context.state.testResultInfo.id,
            payload.sequence,
            payload.index,
            {
              summary: payload.summary,
              details: payload.details,
            }
          )
        ).data!;
      }

      // add
      return (
        await context.rootState.repositoryServiceDispatcher.addBug(
          context.state.testResultInfo.id,
          payload.sequence,
          {
            summary: payload.summary,
            details: payload.details,
            imageData,
          }
        )
      ).data!;
    })();

    context.commit("setBug", recordedNote);
    context.commit("setCanUpdateModels", { canUpdateModels: true });

    if (context.state.config.imageCompression.isEnabled) {
      console.log("== bug ==");
      setTimeout(async () => {
        const reply2 = await context.rootState.repositoryServiceDispatcher.compressNoteImage(
          context.state.testResultInfo.id,
          recordedNote.bug.id as number
        );
        if (reply2.succeeded) {
          context.commit("replaceNoteImageFileUrl", {
            type: "bug",
            sequence: payload.sequence,
            index: recordedNote.index,
            imageFileUrl: reply2.data?.imageFileUrl,
          });
        } else {
          throw reply2.error;
        }
      }, 1);
    }
  },

  /**
   * Move a bug.
   * @param context Action context.
   * @param payload.from.sequence Sequence number of the source bug.
   * @param payload.from.index Index for source bugs related to the same operation.
   * @param payload.dest.sequence Sequence number of the destination bug.
   */
  async moveBug(
    context,
    payload: {
      from: {
        sequence: number;
        index: number;
      };
      dest: {
        sequence: number;
      };
    }
  ) {
    const reply = await context.rootState.repositoryServiceDispatcher.moveBug(
      context.state.testResultInfo.id,
      payload.from,
      payload.dest
    );

    const movedNote = reply.data!;

    context.commit("deleteBug", payload.from);
    context.commit("setBug", movedNote);
    context.commit("setCanUpdateModels", { canUpdateModels: true });
  },

  /**
   * Delete a bug.
   * @param context Action context.
   * @param payload.sequence Sequence number of the bug.
   * @param payload.index Index for bugs related to the same operation.
   */
  async deleteBug(context, payload: { sequence: number; index: number }) {
    const reply = await context.rootState.repositoryServiceDispatcher.deleteBug(
      context.state.testResultInfo.id,
      payload.sequence,
      payload.index
    );

    const { sequence, index } = reply.data!;

    context.commit("deleteBug", { sequence, index });
    context.commit("setCanUpdateModels", { canUpdateModels: true });
  },

  /**
   * Record a notice.
   * @param context Action context.
   * @param payload.noteEditInfo Notice information.
   */
  async saveNotice(context, payload: { noteEditInfo: NoteEditInfo }) {
    const {
      oldSequence,
      oldIndex,
      newSequence,
      note,
      noteDetails,
      shouldTakeScreenshot,
      tags,
    } = payload.noteEditInfo;

    await context.dispatch("recordNotice", {
      summary: note,
      details: noteDetails,
      tags: tags,
      sequence:
        oldSequence !== null
          ? oldSequence
          : (() => {
              const lastIndex = context.state.history.length - 1;
              return context.state.history[lastIndex]?.operation.sequence ?? 1;
            })(),
      index: oldIndex !== null ? oldIndex : undefined,
      shouldTakeScreenshot,
    });

    if (
      oldSequence !== null &&
      oldIndex !== null &&
      newSequence !== null &&
      oldSequence !== newSequence
    ) {
      await context.dispatch("moveNotice", {
        from: {
          sequence: oldSequence,
          index: oldIndex,
        },
        dest: {
          sequence: newSequence,
        },
      });
    }
  },

  /**
   * Save a notice in the repository.
   * @param context Action context.
   * @param payload.summary Summary of the notice.
   * @param payload.details Details of the notice.
   * @param payload.sequence Sequence number of the notice.
   * @param payload.index Index for notices related to the same operation.
   * @param payload.shouldTakeScreenshot Whether to take a screenshot or not.
   */
  async recordNotice(
    context,
    payload: {
      summary: string;
      details: string;
      tags: string[];
      sequence: number;
      index?: number;
      shouldTakeScreenshot: boolean;
    }
  ) {
    // Take a screenshot.
    const imageData: string | undefined = payload.shouldTakeScreenshot
      ? await context.dispatch("captureControl/takeScreenshot", null, {
          root: true,
        })
      : undefined;

    const recordedNote = await (async () => {
      // update
      if (payload.index !== undefined) {
        return (
          await context.rootState.repositoryServiceDispatcher.editNotice(
            context.state.testResultInfo.id,
            payload.sequence,
            payload.index,
            {
              summary: payload.summary,
              details: payload.details,
              tags: payload.tags,
            }
          )
        ).data!;
      }

      // add
      return (
        await context.rootState.repositoryServiceDispatcher.addNotice(
          context.state.testResultInfo.id,
          payload.sequence,
          {
            summary: payload.summary,
            details: payload.details,
            tags: payload.tags,
            imageData,
          }
        )
      ).data!;
    })();

    context.commit("setNotice", recordedNote);
    context.commit("setCanUpdateModels", { canUpdateModels: true });

    if (
      payload.shouldTakeScreenshot &&
      context.state.config.imageCompression.isEnabled
    ) {
      setTimeout(async () => {
        const reply2 = await context.rootState.repositoryServiceDispatcher.compressNoteImage(
          context.state.testResultInfo.id,
          recordedNote.notice.id as number
        );
        if (reply2.succeeded) {
          context.commit("replaceNoteImageFileUrl", {
            type: "notice",
            sequence: payload.sequence,
            index: recordedNote.index,
            imageFileUrl: reply2.data?.imageFileUrl,
          });
        } else {
          throw reply2.error;
        }
      }, 1);
    }
  },

  /**
   * Move a notice.
   * @param context Action context.
   * @param payload.from.sequence Sequence number of the source notice.
   * @param payload.from.index Index for source notices related to the same operation.
   * @param payload.dest.sequence Sequence number of the destination notice.
   */
  async moveNotice(
    context,
    payload: {
      from: {
        sequence: number;
        index: number;
      };
      dest: {
        sequence: number;
      };
    }
  ) {
    const reply = await context.rootState.repositoryServiceDispatcher.moveNotice(
      context.state.testResultInfo.id,
      payload.from,
      payload.dest
    );

    const movedNote = reply.data!;

    context.commit("deleteNotice", payload.from);
    context.commit("setNotice", movedNote);
    context.commit("setCanUpdateModels", { canUpdateModels: true });
  },

  /**
   * Delete a notice.
   * @param context Action context.
   * @param payload.sequence Sequence number of the notice.
   * @param payload.index Index for notices related to the same operation.
   */
  async deleteNotice(context, payload: { sequence: number; index: number }) {
    const reply = await context.rootState.repositoryServiceDispatcher.deleteNotice(
      context.state.testResultInfo.id,
      payload.sequence,
      payload.index
    );

    const { sequence, index } = reply.data!;

    context.commit("deleteNotice", { sequence, index });
    context.commit("setCanUpdateModels", { canUpdateModels: true });
  },

  /**
   * Load a test result from the repository and restore history in the State.
   * @param context Action context.
   * @param payload.testResultId Test result ID.
   */
  async resume(context, payload: { testResultId: string }) {
    try {
      context.commit(
        "captureControl/setIsResuming",
        { isResuming: true },
        { root: true }
      );

      await new ResumeAction(
        {
          setResumedData: async (data) => {
            context.commit("clearHistory");
            context.commit("clearModels");
            context.commit("clearInputValueTable");
            context.commit("selectWindow", { windowHandle: "" });

            context.commit("resetAllCoverageSources", {
              coverageSources: data.coverageSources,
            });
            context.commit("resetInputElementInfos", {
              inputElementInfos: data.inputElementInfos,
            });
            context.commit("resetHistory", {
              historyItems: data.historyItems,
            });
            context.commit(
              "captureControl/setUrl",
              { url: data.url },
              { root: true }
            );
            context.commit("setTestResultInfo", data.testResultInfo);

            await context.dispatch(
              "captureControl/resumeWindowHandles",
              { history: context.state.history },
              { root: true }
            );

            await context.dispatch("updateScreenHistory");
          },
        },
        context.rootState.repositoryServiceDispatcher
      ).resume(payload.testResultId);
    } catch (error) {
      const errorMessage = context.rootGetters.message(
        `error.operation_history.${error.message}`
      );

      throw new Error(errorMessage);
    } finally {
      context.commit(
        "captureControl/setIsResuming",
        { isResuming: false },
        { root: true }
      );
    }
  },

  /**
   * Empty history in the State.
   * @param context Action context.
   */
  resetHistory(context) {
    context.commit("clearHistory");
    context.commit("captureControl/clearWindowHandles", null, { root: true });
    context.commit("clearUnassignedIntentions");
    context.commit("clearAllCoverageSources");
    context.commit("clearInputElementInfos");
    context.commit("setDisplayInclusionList", { displayInclusionList: [] });
    context.commit("clearModels");
    context.commit("selectWindow", { windowHandle: "" });
    context.commit("clearInputValueTable");
    context.commit("setTestResultInfo", { id: "", name: "" });
  },

  /**
   * Save a operation in the repository.
   * @param context Action context.
   * @param payload.operation Operation.
   */
  async registerOperation(context, payload: { operation: CapturedOperation }) {
    const capturedOperation = payload.operation;
    if (context.rootGetters.getSetting("debug.saveItems.keywordSet")) {
      const parser = new DOMParser();
      const document = parser.parseFromString(
        capturedOperation.pageSource,
        "text/html"
      );
      const keywordSet: Set<string> = new Set();
      collectKeyword(document.children[0] as HTMLElement, keywordSet);
      capturedOperation.keywordTexts = Array.from(keywordSet);
    }

    const reply = await context.rootState.repositoryServiceDispatcher.registerOperation(
      context.state.testResultInfo.id,
      capturedOperation
    );

    const { operation, coverageSource, inputElementInfo } = reply.data!;
    operation.inputElements = inputElementInfo?.inputElements ?? [];

    context.commit("addHistory", {
      entry: { operation, intention: null, bugs: null, notices: null },
    });

    context.commit("registerCoverageSource", { coverageSource });
    if (
      !!inputElementInfo &&
      !!inputElementInfo.inputElements &&
      inputElementInfo.inputElements.length !== 0
    ) {
      context.commit("registerInputElementInfo", { inputElementInfo });
    }

    context.commit("setCanUpdateModels", { canUpdateModels: true });

    if (
      context.state.config.imageCompression.isEnabled &&
      operation.imageFilePath
    ) {
      setTimeout(async () => {
        const reply2 = await context.rootState.repositoryServiceDispatcher.compressTestStepImage(
          context.state.testResultInfo.id,
          operation.sequence
        );
        if (reply2.succeeded) {
          context.commit("replaceTestStepsImageFileUrl", {
            sequence: operation.sequence,
            imageFileUrl: `${context.rootState.repositoryServiceDispatcher.serviceUrl}/${reply2.data?.imageFileUrl}`,
          });
        } else {
          throw reply2.error;
        }
      }, 1);
    }
  },

  /**
   * Build a sequence diagram from passed informations.
   * @param context Action context.
   * @param payload.screenHistory Screen history.
   * @param payload.windowHandles Window handles.
   * @param payload.callback The callback when the sequence diagram has operated.
   */
  async buildSequenceDiagramGraph(
    context,
    payload: {
      screenHistory: ScreenHistory;
      windowHandles: WindowHandle[];
      callback: SequenceDiagramGraphCallback;
    }
  ) {
    const graph = await SequenceDiagramGraphConverter.convert(
      payload.screenHistory,
      payload.windowHandles,
      payload.callback
    );

    const svgElement = (() => {
      const element = document.createElement("div");
      element.innerHTML = new MermaidGraphConverter().toSVG(
        "sequenceDiagram",
        graph.graphText
      );
      return element.firstElementChild!;
    })();
    graph.graphExtender.extendGraph(svgElement);

    context.commit("setSequenceDiagramGraph", { graph: svgElement });
  },

  /**
   * Build a screen transition diagram from passed informations.
   * @param context Action context.
   * @param payload.screenHistory Screen history.
   * @param payload.windowHandles Window handles.
   * @param payload.callback The callback when the screen transition diagram has operated.
   */
  async buildScreenTransitionDiagramGraph(
    context,
    payload: {
      screenHistory: ScreenHistory;
      windowHandles: string[];
      callback: FlowChartGraphCallback;
    }
  ) {
    const graphAndWindowHandles = await Promise.all(
      payload.windowHandles.map(async (windowHandle) => {
        return {
          graph: await ScreenTransitionDiagramGraphConverter.convert(
            payload.screenHistory,
            windowHandle,
            payload.callback
          ),
          windowHandle,
        };
      })
    );

    for (const { graph, windowHandle } of graphAndWindowHandles) {
      const svgElement = (() => {
        const element = document.createElement("div");
        element.innerHTML = new MermaidGraphConverter().toSVG(
          "screenTransitionDiagram",
          graph.graphText
        );
        return element.firstElementChild!;
      })();
      graph.graphExtender.extendGraph(svgElement);

      context.commit("setScreenTransitionDiagramGraph", {
        graph: svgElement,
        windowHandle,
      });
    }
  },

  /**
   * Build element coverages from passed informations.
   * @param context Action context.
   * @param payload.screenHistory Screen history.
   * @param payload.inclusionTags Inclusion tags settings for screen element coverage.
   */
  async buildElementCoverages(
    context,
    payload: {
      screenHistory: ScreenHistory;
      inclusionTags: string[];
    }
  ) {
    const coverages = await Coverage.getCoverages(
      payload.screenHistory,
      payload.inclusionTags
    );

    context.commit("setElementCoverages", { coverages });
  },

  /**
   * Update screen history.
   * @param context Action context.
   */
  async updateScreenHistory(context) {
    try {
      context.commit("setScreenHistoryIsUpdating", {
        screenHistoryIsUpdating: true,
      });

      const screenHistory = ScreenHistory.createFromOperationHistory(
        context.getters.getHistory(),
        context.state.coverageSources
      );

      context.commit("setScreenHistory", { screenHistory });

      context.commit("clearModels");

      const windowHandles = context.state.history
        .map((operationWithNotes) => {
          return operationWithNotes.operation.windowHandle;
        })
        .filter((windowHandle, index, array) => {
          return array.indexOf(windowHandle) === index;
        })
        .map((windowHandle, index) => {
          return {
            text: `window${index + 1}`,
            value: windowHandle,
            available: false,
          };
        });

      const selectScreenTransition = (
        screenTransition: ScreenTransition | null
      ) => {
        context.commit("selectScreenTransition", { screenTransition });

        const inputValueTable = new InputValueTable();
        const selectedScreenTransitions: Array<{
          intention: string;
          transitions: Array<{
            sourceScreenDef: string;
            targetScreenDef: string;
            history: Operation[];
            screenElements: ElementInfo[];
            inputElements: ElementInfo[];
          }>;
        }> = context.getters.getSelectedScreenTransitions();

        for (const { intention, transitions } of selectedScreenTransitions) {
          inputValueTable.registerScreenTransitionToIntentions(
            intention,
            ...transitions
          );
        }

        context.commit("setInputValueTable", {
          inputValueTable,
        });
      };

      const selectOperation = (sequence: number) => {
        context.commit("selectOperation", { sequence });

        const operationWithNotes:
          | OperationWithNotes
          | undefined = context.getters.findHistoryItem(sequence);
        if (!operationWithNotes) {
          return;
        }

        context.commit("selectScreen", {
          screenDef: operationWithNotes.operation.screenDef,
        });
      };

      const filterOperation = (displayedOperationSequences: number[]) => {
        context.commit("setDisplayedOperations", {
          sequences: displayedOperationSequences,
        });

        if (displayedOperationSequences.length > 0) {
          context.commit("selectOperation", {
            sequence:
              displayedOperationSequences[
                displayedOperationSequences.length - 1
              ],
          });
        }
      };

      await context.dispatch("buildSequenceDiagramGraph", {
        screenHistory: context.state.screenHistory,
        windowHandles,
        callback: {
          onClickEdge: (edge: Edge) => {
            filterOperation(
              edge.operationHistory.map((item) => {
                return item.operation.sequence;
              })
            );
          },
          onClickScreenRect: selectOperation,
          onClickNote: (note: {
            id: number;
            sequence: number;
            type: string;
          }) => {
            if (!!note && (note.type === "notice" || note.type === "bug")) {
              filterOperation([note.sequence]);
            }
          },
          onRightClickNote: context.state.openNoteMenu,
          onRightClickLoopArea: context.state.openNoteMenu,
        },
      });

      await context.dispatch("buildScreenTransitionDiagramGraph", {
        screenHistory: context.state.screenHistory,
        windowHandles: windowHandles.map((windowHandle) => windowHandle.value),
        callback: {
          onClickEdge: (edge: Edge) => {
            if (!edge.operationHistory[0]) {
              return;
            }

            selectOperation(edge.operationHistory[0].operation.sequence);

            selectScreenTransition({
              source: {
                title: edge.source.title,
                url: edge.source.url,
                screenDef: edge.source.screenDef,
              },
              target: {
                title: edge.target.title,
                url: edge.target.url,
                screenDef: edge.target.screenDef,
              },
            });
          },
          onClickScreenRect: (sequence: number) => {
            selectOperation(sequence);

            selectScreenTransition(null);
          },
        },
      });

      await context.dispatch("buildElementCoverages", {
        screenHistory: context.state.screenHistory,
        inclusionTags: context.state.config.coverage?.include?.tags ?? [],
      });

      await context.dispatch("updateDisplayExclusionList");
    } finally {
      context.commit("setScreenHistoryIsUpdating", {
        screenHistoryIsUpdating: false,
      });
    }
  },

  /**
   * Generate test scripts.
   * @param context Action context.
   * @param payload.testResultId Test result ID.
   * @param payload.projectId Project ID.
   * @param payload.initialUrl Initial page URL.
   * @param payload.sources Informations for generating test scripts.
   * @returns URL of generated test scripts.
   */
  async generateTestScripts(
    context,
    payload: {
      testResultId: string | undefined;
      projectId: string | undefined;
      sources: { initialUrl: string; history: Operation[] }[];
      option: { useDataDriven: boolean; maxGeneration: number };
    }
  ): Promise<string> {
    const optimize = true;

    try {
      const imageUrlResolver = (url: string) => {
        return url.replace(
          `${context.rootState.repositoryServiceDispatcher.serviceUrl}/test-results/`,
          ""
        );
      };

      const testScriptGenerator = new TestScriptGeneratorImpl(
        imageUrlResolver,
        {
          optimize,
          testData: {
            useDataDriven: payload.option.useDataDriven,
            maxGeneration: payload.option.maxGeneration,
          },
        }
      );

      return await new GenerateTestScriptsAction(
        context.rootState.repositoryServiceDispatcher,
        testScriptGenerator
      ).generate({
        testResultId: payload.testResultId,
        projectId: payload.projectId,
        sources: payload.sources,
      });
    } catch (error) {
      if (error.message === `generate_test_suite_failed`) {
        const errorCode = optimize
          ? `save_test_scripts_no_section_error`
          : `save_test_scripts_no_operation_error`;

        throw new Error(
          context.rootGetters.message(`error.operation_history.${errorCode}`)
        );
      }

      throw new Error(
        context.rootGetters.message(`error.operation_history.${error.message}`)
      );
    }
  },

  /**
   * Update selectable tags as exclusion elements for screen element coverage from current coverage sources.
   * @param context Action context.
   */
  async updateDisplayExclusionList(context) {
    const tagSet = new Set(
      context.state.coverageSources.flatMap(({ screenElements }) => {
        return screenElements.map(({ tagname }) => tagname.toUpperCase());
      })
    );

    context.commit("setDisplayInclusionList", {
      displayInclusionList: Array.from(tagSet.values()),
    });
  },

  /**
   * Create an empty test result in the repository.
   * @param context Action context.
   * @param payload.initialUrl Initial URL.
   * @param payload.name Test result name.
   */
  async createTestResult(
    context,
    payload: { initialUrl: string; name: string }
  ) {
    const name = payload.name ? payload.name : undefined;
    const reply = await context.rootState.repositoryServiceDispatcher.createEmptyTestResult(
      payload.initialUrl,
      name
    );

    const testResultInfo = reply.data!;

    context.commit("setTestResultInfo", {
      id: testResultInfo.id,
      name: testResultInfo.name,
    });
  },

  /**
   * Get test results from the repository.
   * @param context Action context.
   * @returns Test results.
   */
  async getTestResults(context) {
    const reply = await context.rootState.repositoryServiceDispatcher.getTestResults();
    return reply.data!;
  },

  async changeCurrentTestResultName(context) {
    if (!context.state.testResultInfo.id) {
      return;
    }

    const reply = await context.rootState.repositoryServiceDispatcher.changeTestResultName(
      context.state.testResultInfo.id,
      context.state.testResultInfo.name
    );

    if (!reply.succeeded) {
      const errorMessage = context.rootGetters.message(
        `error.operation_history.${reply.error!.code}`
      );
      throw new Error(errorMessage);
    }

    const changedName = reply.data!;

    context.commit("setTestResultName", { name: changedName });
  },
};

export default actions;