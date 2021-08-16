<template>
  <div>
    <div id="floatingInput"><input v-on:keyup.enter="sendValue" v-on:keyup.escape="hideInput" v-model="inputValue" style="width:33%;margin-left:33%;" type="text" /></div>
    <button @click="openFolder">Open Folder</button>
    <button @click="showInput('leaf')">📜</button><button @click="showInput('dir')">📂</button>
    <div v-if="loading">Loading ...</div>
    <vue-tree-list
      v-else
      @click="onClick"
      @change-name="onChangeName"
      @delete-node="onDel"
      @add-node="onAddNode"
      :model="data"
      v-bind:default-expanded="false"
    >
      <template v-slot:leafNameDisplay="slotProps">
        <span>
          {{ slotProps.model.name }}
        </span>
      </template>
    </vue-tree-list>
  </div>
</template>

<script>
import { VueTreeList, Tree, TreeNode } from 'vue-tree-list'
import { readDir, createDir, writeFile, removeDir, removeFile, renameFile } from '@tauri-apps/api/fs'
import { videoDir } from '@tauri-apps/api/path'
import { open } from '@tauri-apps/api/dialog'

const getPartialNodePath = (node, accum, override) => {
  if (node.parent == null) {
    return accum.reverse().join('/')
  } else {
    accum.push(override == null ? node.name : override)
    return getPartialNodePath(node.parent, accum)
  }
}

const getFullNodePath = (node, override = null) => {
  return getPartialNodePath(node, [], override)
}

const sortAlphabetically = (a, b) => {
  if (a.name.toLowerCase() < b.name.toLowerCase()) return -1
  if (a.name.toLowerCase() > b.name.toLowerCase()) return 1
  return 0
}
const slugify = (text) =>
  text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
export default {
  components: {
    VueTreeList
  },
  async created () {
    this.rootDir = await videoDir().then(result => result)
    const struct = await readDir(this.rootDir, { recursive: true }).then(result => result)
    this.data = new Tree([])
    this.generateNewTree(struct)
    this.loading = false
  },
  data () {
    return {
      newTree: {},
      data: new Tree([]),
      rootDir: '',
      loading: true,
      inputType: '',
      inputValue: '',
      nodeOldName: undefined,
      renamingNode: null,
      click: null
    }
  },
  methods: {
    onDel (node) {
      const path = getFullNodePath(node)
      if (node.isLeaf) {
        removeFile(this.rootDir + path).then(() => { node.remove() })
      } else {
        removeDir(this.rootDir + path, { recursive: true }).then(() => { node.remove() })
      }
    },
    onChangeName (params) {
      if (this.nodeOldName === undefined && this.renamingNode === null) {
        this.nodeOldName = params.oldName
        this.renamingNode = params.node
      }
      if (params.eventType === 'blur') {
        const nodeNewPath = this.rootDir + getFullNodePath(this.renamingNode, params.newName)
        const nodeOldPath = this.rootDir + getFullNodePath(this.renamingNode, this.nodeOldName)
        renameFile(nodeOldPath, nodeNewPath).then(() => {
          this.nodeOldName = undefined
          this.renamingNode = null
        })
      }
    },
    onAddNode (params) {
      console.log(params)
    },
    handleClick (params) {
      return new Promise((resolve, reject) => {
        if (this.click) {
          clearTimeout(this.click)
          resolve({ type: 'double', params: params })
        }
        this.click = setTimeout(() => {
          this.click = undefined
          resolve({ type: 'single', params: params })
        }, 200)
      })
    },
    onClick (params) {
      this.handleClick(params).then((result) => {
        const { type, params } = result
        if (type === 'single') {
          console.log(type, params)
        }
        if (type === 'double') {
          params.toggle()
        }
      })
    },
    sortTree (node = null) {
      if (node === null) node = this.data
      node.children.sort((a, b) => sortAlphabetically(a, b))
    },
    openFolder () {
      this.loading = true
      open({ directory: true }).then(result => {
        this.rootDir = result
        readDir(result, { recursive: true }).then(result => {
          this.data = new Tree([])
          this.generateNewTree(result)
          this.sortTree()
          this.loading = false
        })
      })
    },
    sendValue () {
      if (this.inputType === 'dir') {
        this.addRootDir(this.inputValue)
      }
      if (this.inputType === 'leaf') {
        this.addRootLeaf(this.inputValue)
      }
      this.hideInput()
    },
    hideInput () {
      document.getElementById('floatingInput').style.top = '-30px'
    },
    showInput (type) {
      this.inputType = type
      this.inputValue = ''
      document.getElementById('floatingInput').style.top = '0px'
      document.querySelector('#floatingInput > input').focus()
    },
    addRootDir (value) {
      console.log('~ ROOT DIR: ', this.rootDir + value)
      // const absPath = this.rootDir + value
      createDir(this.rootDir + value).then((result) => {
        this.addDir({ name: value })
      })
    },
    addDir (item, parent = null) {
      var nodeStruct = {
        name: item.name,
        isLeaf: false,
        id: slugify(item.name)
      }
      var node = new TreeNode(nodeStruct)
      if (!this.data.children) this.data.children = []
      parent == null ? this.data.addChildren(node) : parent.addChildren(node)
      this.sortTree()
      return node
    },
    addRootLeaf (value) {
      console.log('~ ROOT LEAF: ', this.rootDir + value)
      writeFile({ path: this.rootDir + value, contents: '' }).then((result) => {
        this.addLeaf({ name: value })
      })
    },
    addLeaf (item, parent = null) {
      var nodeStruct = {
        name: item.name,
        isLeaf: true,
        id: slugify(item.name)
      }
      var node = new TreeNode(nodeStruct)
      if (!this.data.children) this.data.children = []
      parent == null ? this.data.addChildren(node) : parent.addChildren(node)
      this.sortTree()
    },
    generateNewTree (folderStruct, parent = null) {
      folderStruct.forEach(item => {
        if (item.children) {
          const node = this.addDir(item, parent)
          this.generateNewTree(item.children, node)
        } else {
          this.addLeaf(item, parent)
        }
      })
    }
  }
}
</script>

<style lang="scss">
.vtl{
  .vtl-drag-disabled{
    background-color: #d0cfcf;
    &:hover{
      background-color: #d0cfcf;
    }
  }
  .vtl-disabled {
    background-color: #d0cfcf;
  }
}
</style>

<style lang="scss" scoped>
  #floatingInput{
    position: absolute;
    top: -30px;
    transition-property: top;
    transition-duration: 0.2s;
    transition-delay: 0.05s;
    left: 0;
    right: 0;
    height: auto;
    background-color: #fff;
    box-shadow: 0px 2px 10px rgba($color: #000000, $alpha: 0.1);
    input{
      height: 20px;
    }
  }
  .icon {
    &:hover {
      cursor: pointer;
    }
  }
  .muted {
    color: gray;
    font-size: 80%;
  }
</style>
