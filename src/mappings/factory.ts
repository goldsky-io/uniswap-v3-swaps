import { log } from '@graphprotocol/graph-ts'

import { populateEmptyPools } from '../backfill'
import { PoolCreated } from '../types/Factory/Factory'
import { Factory } from '../types/schema'
import { Bundle, Pool, Token } from '../types/schema'
import { Pool as PoolTemplate } from '../types/templates'
import { getSubgraphConfig, SubgraphConfig } from '../utils/chains'
import { fetchTokenDecimals, fetchTokenName, fetchTokenSymbol, fetchTokenTotalSupply } from '../utils/token'
import { ADDRESS_ZERO, ZERO_BD, ZERO_BI } from './../utils/constants'

// The subgraph handler must have this signature to be able to handle events,
// however, we invoke a helper in order to inject dependencies for unit tests.
export function handlePoolCreated(event: PoolCreated): void {
  handlePoolCreatedHelper(event)
}

// Exported for unit tests
export function handlePoolCreatedHelper(
  event: PoolCreated,
  subgraphConfig: SubgraphConfig = getSubgraphConfig(),
): void {
  const factoryAddress = subgraphConfig.factoryAddress
  const whitelistTokens = subgraphConfig.whitelistTokens
  const tokenOverrides = subgraphConfig.tokenOverrides
  const poolsToSkip = subgraphConfig.poolsToSkip
  const poolMappings = subgraphConfig.poolMappings

  // temp fix
  if (poolsToSkip.includes(event.params.pool.toHexString())) {
    return
  }

  // load factory
  let factory = Factory.load(factoryAddress)
  if (factory === null) {
    factory = new Factory(factoryAddress)
    factory.owner = ADDRESS_ZERO

    // create new bundle for tracking eth price
    const bundle = new Bundle('1')
    bundle.ethPriceUSD = ZERO_BD
    bundle.save()

    populateEmptyPools(event, poolMappings, whitelistTokens, tokenOverrides)
  }

  const pool = new Pool(event.params.pool.toHexString()) as Pool
  let token0 = Token.load(event.params.token0.toHexString())
  let token1 = Token.load(event.params.token1.toHexString())

  // fetch info if null
  if (token0 === null) {
    token0 = new Token(event.params.token0.toHexString())
    token0.symbol = fetchTokenSymbol(event.params.token0, tokenOverrides)
    token0.name = fetchTokenName(event.params.token0, tokenOverrides)
    token0.totalSupply = fetchTokenTotalSupply(event.params.token0)
    const decimals = fetchTokenDecimals(event.params.token0, tokenOverrides)

    // bail if we couldn't figure out the decimals
    if (decimals === null) {
      log.debug('mybug the decimal on token 0 was null', [])
      return
    }

    token0.decimals = decimals
    token0.derivedETH = ZERO_BD
    token0.whitelistPools = []
  }

  if (token1 === null) {
    token1 = new Token(event.params.token1.toHexString())
    token1.symbol = fetchTokenSymbol(event.params.token1, tokenOverrides)
    token1.name = fetchTokenName(event.params.token1, tokenOverrides)
    token1.totalSupply = fetchTokenTotalSupply(event.params.token1)
    const decimals = fetchTokenDecimals(event.params.token1, tokenOverrides)
    // bail if we couldn't figure out the decimals
    if (decimals === null) {
      log.debug('mybug the decimal on token 0 was null', [])
      return
    }
    token1.decimals = decimals
    token1.derivedETH = ZERO_BD
    token1.whitelistPools = []
  }

  // update white listed pools
  if (whitelistTokens.includes(token0.id)) {
    const newPools = token1.whitelistPools
    newPools.push(pool.id)
    token1.whitelistPools = newPools
  }
  if (whitelistTokens.includes(token1.id)) {
    const newPools = token0.whitelistPools
    newPools.push(pool.id)
    token0.whitelistPools = newPools
  }

  pool.token0 = token0.id
  pool.token1 = token1.id
  pool.createdAtTimestamp = event.block.timestamp
  pool.createdAtBlockNumber = event.block.number
  pool.liquidity = ZERO_BI
  pool.sqrtPrice = ZERO_BI
  pool.token0Price = ZERO_BD
  pool.token1Price = ZERO_BD
  pool.totalValueLockedToken0 = ZERO_BD
  pool.totalValueLockedToken1 = ZERO_BD

  pool.save()
  // create the tracked contract based on the template
  PoolTemplate.create(event.params.pool)
  token0.save()
  token1.save()
  factory.save()
}
