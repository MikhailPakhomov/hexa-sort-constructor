import Phaser from 'phaser'

import {
  HEXA_SORT_ASSET_KEYS,
} from './assets'
import { HEXA_SORT_GAME_SIZE } from './gameConfig'
import {
  type HexaSortCellId,
  type HexaSortHexType,
  type HexaSortLevelConfig,
  type HexaSortStackConfig,
  type GameResult,
} from './types'

type BoardCellState = {
  id: HexaSortCellId
  row: number
  slot: number
  column: number
  x: number
  y: number
  emptyView: Phaser.GameObjects.Image
  stackId: string | null
}

type StackLocation =
  | {
      type: 'board'
      cellId: HexaSortCellId
    }
  | {
      type: 'queue'
      index: number
    }

type StackState = {
  id: string
  items: HexaSortHexType[]
  view: Phaser.GameObjects.Container
  hitArea: Phaser.GameObjects.Zone
  location: StackLocation
  homeX: number
  homeY: number
  locked: boolean
  unlockHexCount: number
  lockView?: Phaser.GameObjects.Text
}

type DragState = {
  stack: StackState
  originX: number
  originY: number
  pointerOffsetX: number
  pointerOffsetY: number
  targetCellId: HexaSortCellId | null
}

type TransferCandidate = {
  source: StackState
  destination: StackState
  items: HexaSortHexType[]
}

const BOARD_LAYOUT = {
  centerX: HEXA_SORT_GAME_SIZE.width / 2,
  centerY: 392,
  emptyWidth: 92,
  emptyHeight: 86,
  emptyHoverWidth: 98,
  emptyHoverHeight: 98,
  emptyHoverOffsetY: -6,
  columnStep: 54,
  rowStep: 30,
  stackHexWidth: 66,
  stackHexHeight: 60,
  stackStepY: 3,
  stackOffsetY: -8,
  dropRadius: 36,
  emptyHoverDepth: 10000,
} as const

const QUEUE_LAYOUT = {
  y: HEXA_SORT_GAME_SIZE.height - 165,
  positions: [92, 195, 298],
  enterOffsetX: 92,
  refillDelayStep: 60,
} as const

const RESOLVE_CONFIG = {
  collapseSize: 10,
  maxTransferPasses: 80,
  transferFlipLift: 26,
  transferFlipSideOffset: 24,
  transferFanSpread: 8,
  transferFanLiftStep: 7,
  transferDuration: 500,
  transferDelayStep: 18,
  collapseDelayStep: 18,
  progressFlyDuration: 260,
} as const

const PROGRESS_LAYOUT = {
  trackX: (HEXA_SORT_GAME_SIZE.width - 178) / 2,
  trackY: 146,
  trackWidth: 178,
  trackHeight: 23,
  fillInset: 3,
  iconAssetScale: 3,
} as const

const MAX_TABLET_GAME_SCALE = 1.35

const NEIGHBOR_OFFSETS = [
  [-2, 0],
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
  [2, 0],
] as const

export class HexaSortScene extends Phaser.Scene {
  private readonly level: HexaSortLevelConfig
  private readonly onResult: (result: GameResult) => void
  private boardCells = new Map<HexaSortCellId, BoardCellState>()
  private boardCellsByCoord = new Map<string, BoardCellState>()
  private stacks = new Map<string, StackState>()
  private queueStacks: Array<StackState | null> = []
  private stackQueueIndex = 0
  private dragState: DragState | null = null
  private highlightedCellId: HexaSortCellId | null = null
  private isResolving = false
  private contentLayer?: Phaser.GameObjects.Container
  private backgroundLayer?: Phaser.GameObjects.Container
  private background?: Phaser.GameObjects.Image
  private boardLayer?: Phaser.GameObjects.Container
  private stackLayer?: Phaser.GameObjects.Container
  private queueLayer?: Phaser.GameObjects.Container
  private uiLayer?: Phaser.GameObjects.Container
  private progressFill?: Phaser.GameObjects.Graphics
  private progressText?: Phaser.GameObjects.Text
  private score = 0
  private gameEnded = false
  private colorTextureKeys = new Map<string, string>()

  constructor(level: HexaSortLevelConfig, onResult: (result: GameResult) => void) {
    super('HexaSortScene')
    this.level = level
    this.onResult = onResult
  }

  create() {
    this.createColorTextures()
    this.createLayers()
    this.drawBackground()
    this.createBoard()
    this.createInitialStacks()
    this.createQueueStacks()
    this.createProgressUi()
    this.applyResponsiveLayout(this.scale.width, this.scale.height)
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this)
    })
  }

  private createLayers() {
    this.backgroundLayer = this.add.container(0, 0)
    this.contentLayer = this.add.container(0, 0)
    this.boardLayer = this.add.container(0, 0)
    this.stackLayer = this.add.container(0, 0)
    this.queueLayer = this.add.container(0, 0)
    this.uiLayer = this.add.container(0, 0)
    this.contentLayer.add([
      this.boardLayer,
      this.stackLayer,
      this.queueLayer,
      this.uiLayer,
    ])
  }

  private drawBackground() {
    const { width, height } = HEXA_SORT_GAME_SIZE
    this.background = this.add
      .image(width / 2, height / 2, HEXA_SORT_ASSET_KEYS.background)
      .setDisplaySize(width, height)

    this.backgroundLayer?.add(this.background)
  }

  private handleResize(gameSize: Phaser.Structs.Size) {
    this.applyResponsiveLayout(gameSize.width, gameSize.height)
  }

  private applyResponsiveLayout(viewportWidth: number, viewportHeight: number) {
    const { width: designWidth, height: designHeight } = HEXA_SORT_GAME_SIZE
    const contentScale = Math.min(
      viewportWidth / designWidth,
      viewportHeight / designHeight,
      MAX_TABLET_GAME_SCALE,
    )

    this.contentLayer
      ?.setPosition(
        (viewportWidth - designWidth * contentScale) / 2,
        (viewportHeight - designHeight * contentScale) / 2,
      )
      .setScale(contentScale)

    if (!this.background) {
      return
    }

    const source = this.textures.get(HEXA_SORT_ASSET_KEYS.background).getSourceImage()
    const backgroundScale = Math.max(
      viewportWidth / source.width,
      viewportHeight / source.height,
    )

    this.background
      .setPosition(viewportWidth / 2, viewportHeight / 2)
      .setDisplaySize(source.width * backgroundScale, source.height * backgroundScale)
  }

  private createBoard() {
    this.level.board.cells.forEach((cell) => {
      const position = this.getCellPosition(cell.row, cell.column)
      const emptyView = this.add
        .image(position.x, position.y, HEXA_SORT_ASSET_KEYS.emptyHex)
        .setDisplaySize(BOARD_LAYOUT.emptyWidth, BOARD_LAYOUT.emptyHeight)
        .setDepth(this.getBoardEmptyDepth({ ...position, column: cell.column }))
      

      this.boardLayer?.add(emptyView)
      const boardCell = {
        ...cell,
        ...position,
        emptyView,
        stackId: null,
      }

      this.boardCells.set(cell.id, boardCell)
      this.boardCellsByCoord.set(
        this.getCellCoordKey(cell.row, cell.column),
        boardCell,
      )
    })

  }

  private createInitialStacks() {
    this.level.initialStacks.forEach((stackConfig) => {
      const cell = this.boardCells.get(stackConfig.cellId)

      if (!cell) {
        return
      }

      const stackPosition = this.getBoardStackPosition(cell)
      const stack = this.createStackState(stackConfig, stackPosition.x, stackPosition.y, {
        type: 'board',
        cellId: cell.id,
      })

      cell.stackId = stack.id
      this.stackLayer?.add(stack.view)
    })

    this.updateBoardStackDepths()
  }

  private createQueueStacks() {
    this.queueStacks = QUEUE_LAYOUT.positions.map((x, index) => {
      const sourceConfig = this.level.handStacks[index]

      if (!sourceConfig) {
        return null
      }

      const config = this.resolveStackConfig(sourceConfig, `hand-${index}`)

      const stack = this.createStackState(config, x, QUEUE_LAYOUT.y, {
        type: 'queue',
        index,
      })

      this.makeStackDraggable(stack)
      this.queueLayer?.add(stack.view)

      return stack
    })
  }

  private createProgressUi() {
    const { width } = HEXA_SORT_GAME_SIZE
    const {
      trackX,
      trackY,
      trackWidth,
      trackHeight,
      iconAssetScale,
    } = PROGRESS_LAYOUT
    const hasSpecificColorTarget = this.level.target?.type === 'color' && this.level.target.colorId != null
    const indicatorTexture = hasSpecificColorTarget
      ? this.getHexTextureKey(String(this.level.target?.colorId))
      : HEXA_SORT_ASSET_KEYS.hexIndicatorIcon
    const indicatorIconSize = hasSpecificColorTarget
      ? { width: 36, height: 32 }
      : this.getAssetDisplaySize(HEXA_SORT_ASSET_KEYS.hexIndicatorIcon, iconAssetScale)
    const iconX = trackX + indicatorIconSize.width / 2 - 7
    const title = this.add
      .text(width / 2, 118, this.level.title, {
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        fontSize: '26px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
    const track = this.add.graphics()
    const indicatorIcon = this.add
      .image(iconX, trackY + trackHeight / 2, indicatorTexture)
      .setDisplaySize(indicatorIconSize.width, indicatorIconSize.height)

    track.fillStyle(0xffffff, 1)
    track.fillRoundedRect(trackX, trackY, trackWidth, trackHeight, trackHeight / 2)

    this.progressFill = this.add.graphics()
    this.progressText = this.add
      .text(trackX + trackWidth / 2, trackY + trackHeight / 2, '', {
        color: '#171923',
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)

    this.uiLayer?.add([
      title,
      track,
      this.progressFill,
      indicatorIcon,
      this.progressText,
    ])
    this.updateProgress()
  }

  private createStackState(
    config: HexaSortStackConfig,
    x: number,
    y: number,
    location: StackLocation,
  ) {
    const view = this.add.container(x, y)
    const items = config.items ?? []
    const locked = 'blocker' in config && config.blocker === 'lock'
    const hitHeight = this.getStackHitHeight(items.length)
    const hitArea = this.add.zone(
      0,
      -hitHeight / 2 + BOARD_LAYOUT.stackHexHeight / 2,
      BOARD_LAYOUT.stackHexWidth,
      hitHeight,
    )

    items.forEach((item, index) => {
      const piece = this.add
        .image(0, -index * BOARD_LAYOUT.stackStepY, this.getHexTextureKey(item))
        .setDisplaySize(BOARD_LAYOUT.stackHexWidth, BOARD_LAYOUT.stackHexHeight)

      view.add(piece)
    })

    view.add(hitArea)
    view.sendToBack(hitArea)

    const stack: StackState = {
      id: config.id,
      items: [...items],
      view,
      hitArea,
      location,
      homeX: x,
      homeY: y,
      locked,
      unlockHexCount: 'unlockHexCount' in config && typeof config.unlockHexCount === 'number' ? config.unlockHexCount : 10,
    }

    if (locked) {
      stack.lockView = this.add.text(0, -10, '🔒', {
        fontSize: '25px',
        backgroundColor: '#172033cc',
        padding: { x: 6, y: 4 },
      }).setOrigin(0.5).setDepth(100)
      view.add(stack.lockView)
    }

    this.stacks.set(stack.id, stack)

    return stack
  }

  private makeStackDraggable(stack: StackState) {
    stack.hitArea.setInteractive({ draggable: true })

    stack.hitArea.on('dragstart', (pointer: Phaser.Input.Pointer) => {
      if (this.isResolving || stack.location.type !== 'queue') {
        return
      }

      this.dragState = {
        stack,
        originX: stack.view.x,
        originY: stack.view.y,
        pointerOffsetX: stack.view.x - pointer.worldX,
        pointerOffsetY: stack.view.y - pointer.worldY,
        targetCellId: null,
      }
      this.queueLayer?.bringToTop(stack.view)
      stack.view.setScale(1.06)
    })

    stack.hitArea.on('drag', (pointer: Phaser.Input.Pointer) => {
      if (
        this.isResolving ||
        !this.dragState ||
        this.dragState.stack.id !== stack.id
      ) {
        return
      }

      const dragX = pointer.worldX + this.dragState.pointerOffsetX
      const dragY = pointer.worldY + this.dragState.pointerOffsetY

      stack.view.setPosition(dragX, dragY)
      this.updateDropTarget(dragX, dragY)
    })

    stack.hitArea.on('dragend', () => {
      if (
        this.isResolving ||
        !this.dragState ||
        this.dragState.stack.id !== stack.id
      ) {
        return
      }

      this.completeDrag()
    })
  }

  private updateDropTarget(x: number, y: number) {
    if (this.isResolving) {
      return
    }

    const targetCell = this.findDropTarget(x, y)

    if (this.highlightedCellId === targetCell?.id) {
      this.dragState = this.dragState
        ? {
            ...this.dragState,
            targetCellId: targetCell?.id ?? null,
          }
        : null

      return
    }

    this.clearHighlightedCell()

    if (targetCell) {
      targetCell.emptyView.setTexture(HEXA_SORT_ASSET_KEYS.emptyHoverHex)
      targetCell.emptyView.setDisplaySize(
        BOARD_LAYOUT.emptyHoverWidth,
        BOARD_LAYOUT.emptyHoverHeight,
      )
      targetCell.emptyView.setY(targetCell.y + BOARD_LAYOUT.emptyHoverOffsetY)
      targetCell.emptyView.setDepth(BOARD_LAYOUT.emptyHoverDepth)
      this.boardLayer?.sort('depth')
      this.boardLayer?.bringToTop(targetCell.emptyView)
      this.highlightedCellId = targetCell.id
    }

    if (this.dragState) {
      this.dragState.targetCellId = targetCell?.id ?? null
    }
  }

  private completeDrag() {
    if (this.isResolving) {
      return
    }

    const dragState = this.dragState

    if (!dragState) {
      return
    }

    const targetCell = dragState.targetCellId
      ? this.boardCells.get(dragState.targetCellId)
      : null

    this.dragState = null
    this.clearHighlightedCell()
    dragState.stack.view.setScale(1)

    if (!targetCell) {
      this.returnStackToQueue(dragState.stack, dragState.originX, dragState.originY)

      return
    }

    this.placeStackOnCell(dragState.stack, targetCell)
  }

  private placeStackOnCell(stack: StackState, cell: BoardCellState) {
    const previousLocation = stack.location
    const stackPosition = this.getBoardStackPosition(cell)

    this.isResolving = true
    stack.hitArea.disableInteractive()
    stack.location = {
      type: 'board',
      cellId: cell.id,
    }
    stack.homeX = stackPosition.x
    stack.homeY = stackPosition.y
    cell.stackId = stack.id
    this.stackLayer?.add(stack.view)
    this.updateBoardStackDepths()

    if (previousLocation.type === 'queue') {
      this.queueStacks[previousLocation.index] = null
      this.refillQueueIfEmpty()
    }

    this.tweens.add({
      targets: stack.view,
      x: stackPosition.x,
      y: stackPosition.y,
      duration: 180,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.resolveBoardAfterPlacement(cell.id)
      },
    })
  }

  private returnStackToQueue(stack: StackState, x: number, y: number) {
    this.tweens.add({
      targets: stack.view,
      x,
      y,
      duration: 170,
      ease: 'Cubic.easeOut',
    })
  }

  private refillQueueIfEmpty() {
    if (this.queueStacks.some(Boolean)) {
      return
    }

    this.refillQueue()
  }

  private refillQueue() {
    QUEUE_LAYOUT.positions.forEach((_x, index) => {
      this.refillQueueSlot(index, index * QUEUE_LAYOUT.refillDelayStep)
    })
  }

  private refillQueueSlot(index: number, delay = 0) {
    const config = this.getNextStackConfig(index)

    if (!config) {
      return
    }

    const targetX = QUEUE_LAYOUT.positions[index]
    const startX = HEXA_SORT_GAME_SIZE.width + QUEUE_LAYOUT.enterOffsetX
    const stack = this.createStackState(config, startX, QUEUE_LAYOUT.y, {
      type: 'queue',
      index,
    })

    this.queueStacks[index] = stack
    this.makeStackDraggable(stack)
    this.queueLayer?.add(stack.view)
    this.tweens.add({
      targets: stack.view,
      x: targetX,
      duration: 260,
      delay,
      ease: 'Back.easeOut',
      onComplete: () => {
        stack.homeX = targetX
      },
    })
  }

  private getNextStackConfig(index: number): HexaSortStackConfig | null {
    const queuedStack = this.level.stackQueue[this.stackQueueIndex]

    if (queuedStack) {
      this.stackQueueIndex += 1
      return this.resolveStackConfig(queuedStack, `queue-${index}-${this.stackQueueIndex}`)
    }

    this.stackQueueIndex += 1
    return this.createWeightedRandomStack(`random-${index}-${this.stackQueueIndex}`)
  }

  private resolveStackConfig(config: HexaSortStackConfig, suffix: string): HexaSortStackConfig {
    if (config.type === 'random') {
      return this.createWeightedRandomStack(suffix)
    }

    const libraryPack = config.packId
      ? this.level.library?.packs.find((pack) => pack.id === config.packId)
      : null

    return {
      ...config,
      id: `${config.id}-${suffix}`,
      items: [...(config.items?.length ? config.items : libraryPack?.items ?? [])],
    }
  }

  private createWeightedRandomStack(suffix: string): HexaSortStackConfig {
    const weightedPacks = (this.level.randomQueue?.packs ?? [])
      .map((entry) => ({
        ...entry,
        pack: this.level.library?.packs.find((pack) => pack.id === entry.packId),
      }))
      .filter((entry) => entry.pack && entry.weight > 0)
    const totalWeight = weightedPacks.reduce((sum, entry) => sum + entry.weight, 0)

    if (totalWeight > 0) {
      let roll = Math.random() * totalWeight
      for (const entry of weightedPacks) {
        roll -= entry.weight
        if (roll <= 0 && entry.pack) {
          return { id: `weighted-${entry.packId}-${suffix}`, packId: entry.packId, items: [...entry.pack.items] }
        }
      }
    }

    const fallback = this.level.library?.packs[0]
    if (fallback) {
      return { id: `fallback-${suffix}`, packId: fallback.id, items: [...fallback.items] }
    }

    return { id: `fallback-${suffix}`, items: ['1', '1', '1'] }
  }

  private findDropTarget(x: number, y: number) {
    let nearestCell: BoardCellState | null = null
    let nearestDistance = Number.POSITIVE_INFINITY

    for (const cell of this.boardCells.values()) {
      if (cell.stackId) {
        continue
      }

      const stackPosition = this.getBoardStackPosition(cell)
      const distance = Phaser.Math.Distance.Between(
        x,
        y,
        stackPosition.x,
        stackPosition.y,
      )

      if (distance < nearestDistance && distance <= BOARD_LAYOUT.dropRadius) {
        nearestCell = cell
        nearestDistance = distance
      }
    }

    return nearestCell
  }

  private clearHighlightedCell() {
    if (!this.highlightedCellId) {
      return
    }

    const cell = this.boardCells.get(this.highlightedCellId)

    if (cell) {
      cell.emptyView.setTexture(HEXA_SORT_ASSET_KEYS.emptyHex)
      cell.emptyView.setDisplaySize(
        BOARD_LAYOUT.emptyWidth,
        BOARD_LAYOUT.emptyHeight,
      )
      cell.emptyView.setY(cell.y)
      cell.emptyView.setDepth(this.getBoardEmptyDepth(cell))
      this.boardLayer?.sort('depth')
    }

    this.highlightedCellId = null
  }

  private updateProgress() {
    const { trackX, trackY, trackWidth, trackHeight, fillInset } = PROGRESS_LAYOUT
    const progress = Phaser.Math.Clamp(this.score / this.level.targetScore, 0, 1)
    const fillHeight = trackHeight - fillInset * 2
    const fillWidth = Math.max(0, (trackWidth - fillInset * 2) * progress)

    this.progressFill?.clear()
    this.progressFill?.fillStyle(0xa4fe02, 1)

    if (fillWidth > 0) {
      this.progressFill?.fillRoundedRect(
        trackX + fillInset,
        trackY + fillInset,
        fillWidth,
        fillHeight,
        Math.min(fillHeight / 2, fillWidth / 2),
      )
    }

    this.progressText?.setText(`${this.score}/${this.level.targetScore}`)
  }

  private getAssetDisplaySize(key: string, assetScale: number) {
    const source = this.textures.get(key).getSourceImage() as
      | HTMLImageElement
      | HTMLCanvasElement

    return {
      width: source.width / assetScale,
      height: source.height / assetScale,
    }
  }

  private async resolveBoardAfterPlacement(cellId: HexaSortCellId) {
    const stack = this.getStackOnCell(cellId)

    if (!stack) {
      this.isResolving = false

      return
    }

    try {
      const touchedStacks = await this.resolveTransfersAround(stack)

      for (const touchedStack of touchedStacks) {
        if (this.stacks.has(touchedStack.id)) {
          await this.resolveCollapseIfNeeded(touchedStack)
        }
      }
    } finally {
      this.isResolving = false
      this.evaluateGameState()
    }
  }

  private async resolveTransfersAround(anchor: StackState) {
    const touchedStacks = new Map<string, StackState>([[anchor.id, anchor]])
    const queuedStackIds = new Set<string>()
    const scanQueue: StackState[] = []
    let transferPasses = 0

    this.enqueueStackForTransferScan(anchor, scanQueue, queuedStackIds)

    while (scanQueue.length > 0) {
      const currentStack = scanQueue.shift()

      if (!currentStack) {
        break
      }

      queuedStackIds.delete(currentStack.id)

      if (!this.stacks.has(currentStack.id)) {
        continue
      }

      const candidate = this.findTransferCandidate(currentStack, anchor.id)

      if (!candidate) {
        continue
      }

      await this.transferTopRun(
        candidate.source,
        candidate.destination,
        candidate.items,
      )

      touchedStacks.set(candidate.source.id, candidate.source)
      touchedStacks.set(candidate.destination.id, candidate.destination)
      this.enqueueTransferScanArea(
        candidate.source,
        scanQueue,
        queuedStackIds,
      )
      this.enqueueTransferScanArea(
        candidate.destination,
        scanQueue,
        queuedStackIds,
      )
      transferPasses += 1

      if (transferPasses >= RESOLVE_CONFIG.maxTransferPasses) {
        break
      }
    }

    return Array.from(touchedStacks.values())
  }

  private findTransferCandidate(
    anchor: StackState,
    priorityDestinationId?: string,
  ): TransferCandidate | null {
    const anchorColor = this.getTopColor(anchor)
    const anchorRun = this.getTopRun(anchor)

    if (anchor.locked || !anchorColor || anchorRun.length === 0 || anchor.location.type !== 'board') {
      return null
    }

    const neighborCells = this.getNeighborCells(anchor.location.cellId)

    for (const cell of neighborCells) {
      const stack = this.getStackOnCell(cell.id)

      if (!stack || stack.id === anchor.id || stack.locked) {
        continue
      }

      const topRun = this.getTopRun(stack)

      if (topRun.length === 0 || topRun[0] !== anchorColor) {
        continue
      }

      if (anchor.id === priorityDestinationId) {
        return {
          source: stack,
          destination: anchor,
          items: topRun,
        }
      }

      if (anchorRun.length >= topRun.length) {
        return {
          source: stack,
          destination: anchor,
          items: topRun,
        }
      }

      return {
        source: anchor,
        destination: stack,
        items: anchorRun,
      }
    }

    return null
  }

  private enqueueTransferScanArea(
    stack: StackState,
    scanQueue: StackState[],
    queuedStackIds: Set<string>,
  ) {
    this.enqueueStackForTransferScan(stack, scanQueue, queuedStackIds)

    if (stack.location.type !== 'board') {
      return
    }

    this.getNeighborCells(stack.location.cellId).forEach((cell) => {
      const neighborStack = this.getStackOnCell(cell.id)

      if (neighborStack) {
        this.enqueueStackForTransferScan(
          neighborStack,
          scanQueue,
          queuedStackIds,
        )
      }
    })
  }

  private enqueueStackForTransferScan(
    stack: StackState,
    scanQueue: StackState[],
    queuedStackIds: Set<string>,
  ) {
    if (queuedStackIds.has(stack.id) || !this.stacks.has(stack.id)) {
      return
    }

    queuedStackIds.add(stack.id)
    scanQueue.push(stack)
  }

  private async transferTopRun(
    source: StackState,
    destination: StackState,
    items: HexaSortHexType[],
  ) {
    if (items.length === 0) {
      return
    }

    const sourceStartSize = source.items.length
    const destinationStartSize = destination.items.length
    const movedItems = source.items.splice(source.items.length - items.length)
    const sourcePoints = movedItems.map((_item, index) =>
      this.getStackItemWorldPosition(
        source,
        sourceStartSize - movedItems.length + index,
      ),
    )
    const destinationPoints = movedItems.map((_item, index) =>
      this.getStackItemWorldPosition(destination, destinationStartSize + index),
    )

    destination.items.push(...movedItems)
    this.syncStackView(source, true)

    await Promise.all(
      movedItems.map((item, index) =>
        this.animateTransferItem(
          item,
          sourcePoints[index],
          destinationPoints[index],
          index,
          movedItems.length,
        ),
      ),
    )

    this.syncStackView(destination, false)
    this.updateBoardStackDepths()

    if (source.items.length === 0 && source.location.type === 'board') {
      this.removeBoardStack(source)
    }
  }

  private async resolveCollapseIfNeeded(stack: StackState) {
    const topRun = this.getTopRun(stack)

    if (topRun.length < RESOLVE_CONFIG.collapseSize) {
      return
    }

    const collapseCount = topRun.length
    const collapseColor = topRun[0]

    await this.animateCollapse(stack, collapseCount, collapseColor)
    this.unlockAdjacentStacks(stack, collapseCount)

    if (stack.items.length === 0) {
      this.removeBoardStack(stack)

      return
    }

    this.updateStackHitArea(stack)
    this.updateBoardStackDepths()
  }

  private async animateTransferItem(
    item: HexaSortHexType,
    from: Phaser.Math.Vector2,
    to: Phaser.Math.Vector2,
    index: number,
    totalItems: number,
  ) {
    const moveAngle = Phaser.Math.Angle.Between(from.x, from.y, to.x, to.y)
    const moveAngleDegrees = Phaser.Math.RadToDeg(moveAngle)
    const flipLean = to.x >= from.x ? 42 : -42
    const fanIndex = totalItems - 1 - index
    const delay = fanIndex * RESOLVE_CONFIG.transferDelayStep
    const sideDirection = to.x >= from.x ? 1 : -1
    const stackProgressOffset = fanIndex - (totalItems - 1) / 2
    const sideOffset =
      RESOLVE_CONFIG.transferFlipSideOffset * sideDirection +
      stackProgressOffset * RESOLVE_CONFIG.transferFanSpread
    const liftOffset =
      RESOLVE_CONFIG.transferFlipLift +
      fanIndex * RESOLVE_CONFIG.transferFanLiftStep
    const openAngle = -moveAngleDegrees + flipLean + stackProgressOffset * 5
    const edgeAngle = -moveAngleDegrees - flipLean + stackProgressOffset * 4
    const flyer = this.add
      .container(from.x, from.y)
      .setAngle(moveAngleDegrees)
      .setDepth(10 + fanIndex)
    const piece = this.add
      .image(from.x, from.y, this.getHexTextureKey(item))
      .setDisplaySize(BOARD_LAYOUT.stackHexWidth, BOARD_LAYOUT.stackHexHeight)
      .setPosition(0, 0)
      .setAngle(-moveAngleDegrees)
    const shadow = this.add
      .ellipse(0, BOARD_LAYOUT.stackHexHeight * 0.24, 48, 14, 0x122060, 0.16)
      .setScale(0.62)
    const firstTurnPoint = {
      x: Phaser.Math.Linear(from.x, to.x, 0.22) + sideOffset * 0.85,
      y:
        Phaser.Math.Linear(from.y, to.y, 0.22) -
        liftOffset,
    }
    const secondTurnPoint = {
      x: Phaser.Math.Linear(from.x, to.x, 0.58) + sideOffset,
      y:
        Phaser.Math.Linear(from.y, to.y, 0.58) -
        liftOffset * 0.88,
    }
    const closingPoint = {
      x: Phaser.Math.Linear(from.x, to.x, 0.82) + sideOffset * 0.35,
      y:
        Phaser.Math.Linear(from.y, to.y, 0.82) -
        liftOffset * 0.28,
    }

    flyer.add(shadow)
    flyer.add(piece)
    this.stackLayer?.add(flyer)
    this.stackLayer?.bringToTop(flyer)

    await this.wait(delay)
    await Promise.all([
      this.tweenTo(flyer, {
        x: firstTurnPoint.x,
        y: firstTurnPoint.y,
        scaleX: 0.52,
        scaleY: 1.04,
        duration: RESOLVE_CONFIG.transferDuration * 0.26,
        ease: 'Sine.easeOut',
      }),
      this.tweenTo(piece, {
        angle: openAngle,
        duration: RESOLVE_CONFIG.transferDuration * 0.26,
        ease: 'Sine.easeOut',
      }),
      this.tweenTo(shadow, {
        alpha: 0.06,
        scaleX: 0.38,
        duration: RESOLVE_CONFIG.transferDuration * 0.26,
        ease: 'Sine.easeOut',
      }),
    ])
    await Promise.all([
      this.tweenTo(flyer, {
        x: secondTurnPoint.x,
        y: secondTurnPoint.y,
        scaleX: 0.08,
        scaleY: 1.08,
        duration: RESOLVE_CONFIG.transferDuration * 0.22,
        ease: 'Linear',
      }),
      this.tweenTo(piece, {
        angle: edgeAngle,
        duration: RESOLVE_CONFIG.transferDuration * 0.22,
        ease: 'Linear',
      }),
    ])
    await Promise.all([
      this.tweenTo(flyer, {
        x: closingPoint.x,
        y: closingPoint.y,
        scaleX: 0.46,
        scaleY: 1.02,
        duration: RESOLVE_CONFIG.transferDuration * 0.22,
        ease: 'Sine.easeInOut',
      }),
      this.tweenTo(piece, {
        angle: -moveAngleDegrees + flipLean * 0.32,
        duration: RESOLVE_CONFIG.transferDuration * 0.22,
        ease: 'Sine.easeInOut',
      }),
    ])
    await Promise.all([
      this.tweenTo(flyer, {
        x: to.x,
        y: to.y,
        scaleX: 1,
        scaleY: 1,
        duration: RESOLVE_CONFIG.transferDuration * 0.3,
        ease: 'Sine.easeOut',
      }),
      this.tweenTo(piece, {
        angle: -moveAngleDegrees,
        duration: RESOLVE_CONFIG.transferDuration * 0.3,
        ease: 'Sine.easeOut',
      }),
      this.tweenTo(shadow, {
        alpha: 0.18,
        scaleX: 0.62,
        duration: RESOLVE_CONFIG.transferDuration * 0.3,
        ease: 'Sine.easeOut',
      }),
    ])

    flyer.destroy()
  }

  private async animateCollapse(
    stack: StackState,
    collapseCount: number,
    color: HexaSortHexType,
  ) {
    const flyPromises: Array<Promise<void>> = []

    for (let index = 0; index < collapseCount; index += 1) {
      const pieces = this.getStackPieceViews(stack)
      const piece = pieces.at(-1)

      if (!piece) {
        return
      }

      const worldPosition = {
        x: stack.view.x + piece.x,
        y: stack.view.y + piece.y,
      }
      const item = stack.items.at(-1) ?? color

      piece.destroy()
      stack.items.pop()
      this.updateStackHitArea(stack)
      this.updateBoardStackDepths()
      flyPromises.push(this.animateCollapsedHexToProgress(item, worldPosition))

      if (index < collapseCount - 1) {
        await this.wait(RESOLVE_CONFIG.collapseDelayStep)
      }
    }

    await Promise.all(flyPromises)
  }

  private async animateCollapsedHexToProgress(
    color: HexaSortHexType,
    position: { x: number; y: number },
  ) {
    const target = this.getProgressTargetPosition()
    const token = this.add
      .image(position.x, position.y, this.getHexTextureKey(color))
      .setDisplaySize(
        BOARD_LAYOUT.stackHexWidth * 0.28,
        BOARD_LAYOUT.stackHexHeight * 0.28,
      )
      .setAlpha(0.98)

    this.uiLayer?.add(token)
    this.uiLayer?.bringToTop(token)

    await this.tweenTo(token, {
      x: target.x,
      y: target.y,
      scaleX: 0.36,
      scaleY: 0.36,
      alpha: 0,
      duration: RESOLVE_CONFIG.progressFlyDuration,
      ease: 'Cubic.easeInOut',
      onComplete: () => {
        token.destroy()
      },
    })

    const targetMatches = this.isTargetColor(color)
    if (targetMatches) {
      this.score += 1
    }
    this.updateProgress()

    if (this.score >= this.level.targetScore) {
      this.finishGame('victory')
    }

    if (this.progressText) {
      this.tweens.add({
        targets: this.progressText,
        scaleX: 1.16,
        scaleY: 1.16,
        duration: 30,
        yoyo: true,
        ease: 'Sine.easeOut',
      })
    }
  }

  private syncStackView(stack: StackState, animated: boolean) {
    this.getStackPieceViews(stack).forEach((piece) => {
      piece.destroy()
    })

    stack.items.forEach((item, index) => {
      const piece = this.add
        .image(0, -index * BOARD_LAYOUT.stackStepY, this.getHexTextureKey(item))
        .setDisplaySize(BOARD_LAYOUT.stackHexWidth, BOARD_LAYOUT.stackHexHeight)

      if (animated) {
        piece.setAlpha(0)
        piece.setY(piece.y - 6)
        this.tweens.add({
          targets: piece,
          alpha: 1,
          y: -index * BOARD_LAYOUT.stackStepY,
          duration: 120,
          ease: 'Sine.easeOut',
        })
      }

      stack.view.add(piece)
    })

    this.updateStackHitArea(stack)
    stack.view.bringToTop(stack.hitArea)
    stack.view.sendToBack(stack.hitArea)
  }

  private updateStackHitArea(stack: StackState) {
    const hitHeight = this.getStackHitHeight(stack.items.length)

    stack.hitArea.setSize(BOARD_LAYOUT.stackHexWidth, hitHeight)
    stack.hitArea.setPosition(
      0,
      -hitHeight / 2 + BOARD_LAYOUT.stackHexHeight / 2,
    )
  }

  private getNeighborCells(cellId: HexaSortCellId) {
    const cell = this.boardCells.get(cellId)

    if (!cell) {
      return []
    }

    return NEIGHBOR_OFFSETS.map(([rowOffset, columnOffset]) =>
      this.boardCellsByCoord.get(
        this.getCellCoordKey(cell.row + rowOffset, cell.column + columnOffset),
      )
    ).filter((neighbor): neighbor is BoardCellState => Boolean(neighbor))
  }

  private getStackOnCell(cellId: HexaSortCellId) {
    const stackId = this.boardCells.get(cellId)?.stackId

    return stackId ? this.stacks.get(stackId) ?? null : null
  }

  private getTopColor(stack: StackState) {
    return stack.items.at(-1) ?? null
  }

  private getTopRun(stack: StackState) {
    const topColor = this.getTopColor(stack)

    if (!topColor) {
      return []
    }

    const run: HexaSortHexType[] = []

    for (let index = stack.items.length - 1; index >= 0; index -= 1) {
      const item = stack.items[index]

      if (item !== topColor) {
        break
      }

      run.unshift(item)
    }

    return run
  }

  private getStackPieceViews(stack: StackState) {
    return stack.view
      .getAll()
      .filter(
        (child): child is Phaser.GameObjects.Image =>
          child instanceof Phaser.GameObjects.Image,
      )
  }

  private getStackItemWorldPosition(stack: StackState, itemIndex: number) {
    return new Phaser.Math.Vector2(
      stack.view.x,
      stack.view.y - itemIndex * BOARD_LAYOUT.stackStepY,
    )
  }

  private getProgressTargetPosition() {
    return {
      x: PROGRESS_LAYOUT.trackX + PROGRESS_LAYOUT.trackWidth / 2,
      y: PROGRESS_LAYOUT.trackY + PROGRESS_LAYOUT.trackHeight / 2,
    }
  }

  private removeBoardStack(stack: StackState) {
    if (stack.location.type === 'board') {
      const cell = this.boardCells.get(stack.location.cellId)

      if (cell?.stackId === stack.id) {
        cell.stackId = null
      }
    }

    this.stacks.delete(stack.id)
    stack.view.destroy(true)
    this.updateBoardStackDepths()
  }

  private unlockAdjacentStacks(source: StackState, collapsedCount: number) {
    if (source.location.type !== 'board') return

    this.getNeighborCells(source.location.cellId).forEach((cell) => {
      const stack = this.getStackOnCell(cell.id)
      if (!stack?.locked || collapsedCount < stack.unlockHexCount) return
      stack.locked = false
      stack.lockView?.destroy()
      stack.lockView = undefined
      this.tweens.add({ targets: stack.view, scaleX: 1.12, scaleY: 1.12, duration: 130, yoyo: true })
    })
  }

  private evaluateGameState() {
    if (this.gameEnded || this.score >= this.level.targetScore) return
    const hasEmptyCell = Array.from(this.boardCells.values()).some((cell) => !cell.stackId)
    if (!hasEmptyCell) this.finishGame('defeat')
  }

  private isTargetColor(color: HexaSortHexType) {
    if (!this.level.target || this.level.target.type === 'any') return true

    const targetColorId = String(this.level.target.colorId ?? '').trim()
    const collapsedColorId = String(color).trim()

    return targetColorId.length > 0 && targetColorId === collapsedColorId
  }

  private finishGame(result: GameResult) {
    if (this.gameEnded) return
    this.gameEnded = true
    this.input.enabled = false
    this.onResult(result)
  }

  private updateBoardStackDepths() {
    for (const stack of this.stacks.values()) {
      if (stack.location.type !== 'board') {
        continue
      }

      stack.view.setDepth(this.getBoardStackDepth(stack))
    }

    this.stackLayer?.sort('depth')
  }

  private getBoardStackDepth(stack: StackState) {
    if (stack.location.type !== 'board') {
      return 0
    }

    const cell = this.boardCells.get(stack.location.cellId)

    if (!cell) {
      return 0
    }

    return (
      cell.y +
      stack.items.length * BOARD_LAYOUT.stackStepY +
      cell.column * 0.01
    )
  }

  private tweenTo(
    target: Phaser.GameObjects.GameObject,
    config: Omit<Phaser.Types.Tweens.TweenBuilderConfig, 'targets'>,
  ) {
    return new Promise<void>((resolve) => {
      this.tweens.add({
        ...config,
        targets: target,
        onComplete: () => {
          config.onComplete?.()
          resolve()
        },
      })
    })
  }

  private wait(delay: number) {
    return new Promise<void>((resolve) => {
      this.time.delayedCall(delay, () => {
        resolve()
      })
    })
  }

  private getStackHitHeight(stackSize: number) {
    return BOARD_LAYOUT.stackHexHeight + Math.max(0, stackSize - 1) * BOARD_LAYOUT.stackStepY
  }

  private getCellPosition(row: number, column: number) {
    const centerRow = (this.level.board.rows.length - 1) / 2

    return {
      x: BOARD_LAYOUT.centerX + column * BOARD_LAYOUT.columnStep,
      y: BOARD_LAYOUT.centerY + (row - centerRow) * BOARD_LAYOUT.rowStep,
    }
  }

  private getBoardEmptyDepth(cell: Pick<BoardCellState, 'x' | 'y' | 'column'>) {
    return cell.y + cell.column * 0.01
  }

  private getBoardStackPosition(cell: Pick<BoardCellState, 'x' | 'y'>) {
    return {
      x: cell.x,
      y: cell.y + BOARD_LAYOUT.stackOffsetY,
    }
  }

  private getCellCoordKey(row: number, column: number) {
    return `${row}:${column}`
  }

  private createColorTextures() {
    const colors = this.level.library?.colors ?? []
    colors.forEach((color, index) => {
      const key = `constructor-color-${index}`
      const fill = Phaser.Display.Color.HexStringToColor(color.hex || '#999999').color
      const graphics = this.make.graphics({ x: 0, y: 0 })
      graphics.fillStyle(fill, 1)
      graphics.lineStyle(3, Phaser.Display.Color.ValueToColor(fill).darken(25).color, 1)
      graphics.beginPath()
      graphics.moveTo(17, 2)
      graphics.lineTo(53, 2)
      graphics.lineTo(68, 31)
      graphics.lineTo(53, 60)
      graphics.lineTo(17, 60)
      graphics.lineTo(2, 31)
      graphics.closePath()
      graphics.fillPath()
      graphics.strokePath()
      graphics.lineStyle(2, 0xffffff, 0.22)
      graphics.lineBetween(18, 5, 52, 5)
      graphics.generateTexture(key, 70, 62)
      graphics.destroy()
      this.colorTextureKeys.set(color.id, key)
    })
  }

  private getHexTextureKey(colorId: HexaSortHexType) {
    return this.colorTextureKeys.get(colorId) ?? HEXA_SORT_ASSET_KEYS.hex1
  }
}
