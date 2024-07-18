import { Address, ethereum } from '@graphprotocol/graph-ts'

import { Pool as PoolABI } from '../types/Factory/Pool'
import { Pool, Token } from '../types/schema'
import { Pool as PoolTemplate } from '../types/templates'
import { ZERO_BD, ZERO_BI } from '../utils/constants'
import { StaticTokenDefinition } from '../utils/staticTokenDefinition'
import { fetchTokenDecimals, fetchTokenName, fetchTokenSymbol, fetchTokenTotalSupply } from '../utils/token'

function populateToken(tokenAddress: string, tokenOverrides: StaticTokenDefinition[]): void {
  let token = Token.load(tokenAddress)
  if (token != null) {
    return
  }
  token = new Token(tokenAddress)
  token.symbol = fetchTokenSymbol(Address.fromString(tokenAddress), tokenOverrides)
  token.name = fetchTokenName(Address.fromString(tokenAddress), tokenOverrides)
  token.totalSupply = fetchTokenTotalSupply(Address.fromString(tokenAddress))
  const decimals = fetchTokenDecimals(Address.fromString(tokenAddress), tokenOverrides)
  if (decimals === null) {
    return
  }
  token.decimals = decimals
  token.derivedETH = ZERO_BD
  token.whitelistPools = []
  token.save()
}

/**
 * Create entries in store for hard-coded pools and tokens. This is only
 * used for generating optimism pre-regenesis data.
 */
export function populateEmptyPools(
  event: ethereum.Event,
  poolMappings: Array<Address[]>,
  whitelistTokens: string[],
  tokenOverrides: StaticTokenDefinition[],
): void {
  const length = poolMappings.length
  for (let i = 0; i < length; ++i) {
    const poolMapping = poolMappings[i]
    const newAddress = poolMapping[1]
    const token0Address = poolMapping[2]
    const token1Address = poolMapping[3]

    const poolContract = PoolABI.bind(newAddress)
    const pool = new Pool(newAddress.toHexString()) as Pool
    pool.createdAtBlockNumber = event.block.number
    pool.createdAtTimestamp = event.block.timestamp
    pool.token0 = token0Address.toHexString()
    pool.token1 = token1Address.toHexString()
    pool.liquidity = poolContract.liquidity()
    pool.sqrtPrice = ZERO_BI
    pool.token0Price = ZERO_BD
    pool.token1Price = ZERO_BD
    pool.totalValueLockedToken0 = ZERO_BD
    pool.totalValueLockedToken1 = ZERO_BD

    // create token entities if needed
    populateToken(token0Address.toHexString(), tokenOverrides)
    populateToken(token1Address.toHexString(), tokenOverrides)
    const token0 = Token.load(token0Address.toHexString())
    const token1 = Token.load(token1Address.toHexString())

    if (token0 && token1) {
      if (whitelistTokens.includes(pool.token0)) {
        const newPools = token1.whitelistPools
        newPools.push(pool.id)
        token1.whitelistPools = newPools
      }

      if (whitelistTokens.includes(token1.id)) {
        const newPools = token0.whitelistPools
        newPools.push(pool.id)
        token0.whitelistPools = newPools
      }

      // add pool to tracked address and store entities
      PoolTemplate.create(Address.fromString(pool.id))
      token0.save()
      token1.save()
      pool.save()
    }
  }
}
